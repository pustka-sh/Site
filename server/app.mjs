import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { loadConfig, ROOT } from './config.mjs';
import { createStore } from './storage.mjs';
import { sanitizeSharedSettings } from './services/shared-config.mjs';
import { createIssueService } from './services/issues.mjs';
import { checkMinecraftServer } from './services/minecraft.mjs';
import { inspectSetup } from './services/setup-checker.mjs';
import { createGithubService } from './services/github.mjs';
import { createContentService, verifyWebhook } from './services/content-sync.mjs';
import { createDemoService } from './services/demo.mjs';
import { createDocumentationService } from './services/documentation.mjs';
import { documentationHtml, renderPublishedDocumentation } from './documentation-html.mjs';
import {documentationSitemapIndex,documentationVersionSitemap} from './documentation-sitemap.mjs';
import {pages} from '../src/data/site.js';

const apiError = (status, code, message) => Object.assign(new Error(message), {status, code, expose:true});
const feedbackPages = new Set(['/api', ...['relay','introduction','quickstart','compatibility','backend','client','packets','configuration','protocol-ids'].map(page=>`/docs/${page}`)]);
const pageSchema = z.string().max(100).refine(page=>feedbackPages.has(page));
const reportSchema = z.object({page: pageSchema, title: z.string().trim().min(5).max(120), body: z.string().trim().min(20).max(4000), website: z.string().max(300).optional(), challenge: z.string().min(1).max(512)});
const parse = (schema, value) => {
  const result = schema.safeParse(value);
  if (!result.success) throw apiError(400, 'INVALID_INPUT', 'Some fields are missing or invalid. Review the form and try again.');
  return result.data;
};

function sameOrigin(config) {
  return (req, res, next) => {
    const site = req.get('Sec-Fetch-Site');
    if (site && !['same-origin', 'none'].includes(site)) return next(apiError(403, 'ORIGIN_REJECTED', 'Use this form on pustka.sh.'));
    const origin = req.get('Origin');
    const expected = config.origin || `${req.protocol}://${req.get('host')}`;
    if (origin && origin !== expected) return next(apiError(403, 'ORIGIN_REJECTED', 'Use this form on pustka.sh.'));
    if (!req.is('application/json')) return next(apiError(415, 'JSON_REQUIRED', 'Send this request as JSON.'));
    next();
  };
}

export async function createApplication(overrides = {}) {
  const config = overrides.config || loadConfig();
  const registry = overrides.projects || JSON.parse(readFileSync(path.join(ROOT, 'server/projects.json'), 'utf8'));
  const store = overrides.store || createStore({dataDir: config.dataDir});
  const github = overrides.github || createGithubService({token: config.githubToken, projects: registry});
  const content = overrides.content || createContentService({dataDir: config.dataDir, syncEnabled: config.syncEnabled});
  const demo = overrides.demo || createDemoService({url: config.demoUrl, username: config.demoUsername, password: config.demoPassword, authorization: config.demoAuthorization});
  const documentation = overrides.documentation || await createDocumentationService({dataDir:config.dataDir, projects:registry, keys:config.docsPublishKeys || {}});
  const issues = overrides.issues || createIssueService({token: config.issueToken, repository: config.issueRepo, enabled: config.issueReporting});
  const checkServer = overrides.checkMinecraft || checkMinecraftServer;
  const checkSetup = overrides.checkSetup || inspectSetup;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('json escape', true);
  const hashes = [];
  let shellHtml = '';
  if (existsSync(path.join(config.distDir, 'index.html'))) {
    const html = readFileSync(path.join(config.distDir, 'index.html'), 'utf8');
    shellHtml = html;
    for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) hashes.push(`'sha256-${createHash('sha256').update(match[1].replace(/\r\n?/g,'\n')).digest('base64')}'`);
  }
  app.use(helmet({
    contentSecurityPolicy: {directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", ...hashes],
      styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"], fontSrc: ["'self'"], objectSrc: ["'none'"],
      baseUri: ["'self'"], frameAncestors: ["'none'"], formAction: ["'self'"],
      upgradeInsecureRequests: config.production && config.origin.startsWith('https:') ? [] : null,
    }},
    strictTransportSecurity: config.production && config.origin.startsWith('https:') ? {maxAge: 31536000} : false,
  }));
  const limiter = (limit, windowMs) => rateLimit({windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, message: {error: {code: 'RATE_LIMITED', message: 'Too many requests. Please wait before trying again.'}}});
  const apiLimit = limiter(300, 15 * 60000), writeLimit = limiter(40, 60 * 60000), probeLimit = limiter(12, 10 * 60000), issueLimit = limiter(3, 60 * 60000);
  const globalIssueLimit = rateLimit({windowMs: 86400000, limit: 50, keyGenerator: () => 'site-issue-budget', standardHeaders: 'draft-8', legacyHeaders: false, message: {error: {code: 'REPORT_LIMIT', message: 'The daily report limit has been reached. Please use GitHub directly.'}}});
  app.get('/health', (req, res) => res.json({status: 'ok'}));
  const api = express.Router();
  app.use('/api/site', (req, res, next) => {res.set('Cache-Control', 'no-store'); next();}, apiLimit, api);

  // Signature verification must receive the exact bytes, before JSON parsing.
  const deliveries = new Map();
  api.post('/webhooks/github', limiter(90, 60000), express.raw({type: 'application/json', limit: '256kb'}), async (req, res) => {
    if (!config.webhookSecret) throw apiError(503, 'NOT_CONFIGURED', 'The webhook has not been configured.');
    if (!Buffer.isBuffer(req.body) || !verifyWebhook(req.body, req.get('X-Hub-Signature-256'), config.webhookSecret)) throw apiError(401, 'INVALID_SIGNATURE', 'Invalid webhook signature.');
    let payload;
    try { payload = JSON.parse(req.body.toString('utf8')); } catch { throw apiError(400, 'INVALID_WEBHOOK', 'Invalid webhook payload.'); }
    if (req.get('X-GitHub-Event') === 'ping') return res.json({received: true});
    if (req.get('X-GitHub-Event') !== 'push' || payload.repository?.full_name?.toLowerCase() !== 'pustka-sh/relay' || payload.ref !== 'refs/heads/main' || payload.deleted) return res.status(202).json({received: true, ignored: true});
    const delivery = req.get('X-GitHub-Delivery');
    if (!delivery || !/^[a-zA-Z0-9-]{8,80}$/.test(delivery)) throw apiError(400, 'INVALID_DELIVERY', 'Missing webhook delivery identifier.');
    for (const [key, expires] of deliveries) if (expires < Date.now()) deliveries.delete(key);
    if (deliveries.has(delivery)) return res.json({received: true, duplicate: true});
    if (deliveries.size >= 10000) throw apiError(503, 'WEBHOOK_BUSY', 'The webhook queue is temporarily busy.');
    deliveries.set(delivery, Date.now() + 86400000);
    const result = await content.requestSync();
    res.status(202).json({received: true, ...result});
  });
  api.post('/docs/publish', limiter(30, 60 * 60000), express.raw({type:'application/json', limit:'8mb', inflate:false}), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) throw apiError(415, 'JSON_REQUIRED', 'Send a documentation package as JSON.');
    const result = await documentation.publish(req.body, {project:req.get('X-Pustka-Project'), timestamp:req.get('X-Pustka-Timestamp'), signature:req.get('X-Pustka-Signature')});
    res.status(result.idempotent ? 200 : 201).json(result);
  });
  api.use(express.json({limit: '96kb', strict: true}));
  const writes = [sameOrigin(config), writeLimit];
  api.get('/health', (req, res) => res.json({status:'ok'}));
  api.get('/capabilities', (req, res) => res.json({backend:true,serverChecker:true,setupChecker:true,configSharing:true,feedback:true,issueReporting:issues.enabled,demo:!!config.demoUrl,docsSync:config.syncEnabled,documentation:true}));
  api.get('/docs/projects', async (req,res)=>res.json(await documentation.projects()));
  api.get('/docs/search', async (req,res)=>{
    const options=parse(z.object({q:z.string().trim().min(2).max(120),project:z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).optional(),version:z.string().max(80).optional(),limit:z.coerce.number().int().min(1).max(30).default(20)}),req.query);
    res.json(await documentation.search({query:options.q,project:options.project||null,version:options.version||null,limit:options.limit}));
  });
  api.get('/docs/:project/versions', async (req,res)=>res.json(await documentation.versions(req.params.project)));
  api.get('/docs/:project/compare', async (req,res)=>{const query=parse(z.object({from:z.string().min(1).max(80),to:z.string().min(1).max(80)}).strict(),req.query);res.json(await documentation.compare(req.params.project,query.from,query.to));});
  api.get('/docs/:project/:version/pages/:slug', async (req,res)=>res.json(await documentation.page(req.params.project,req.params.version,req.params.slug)));
  api.get('/docs/:project/:version/api', async (req,res)=>res.json(await documentation.symbol(req.params.project,req.params.version,req.query.symbol)));
  api.get('/docs/:project/:version', async (req,res)=>res.json(await documentation.manifest(req.params.project,req.params.version)));
  api.get('/projects', async (req, res) => {
    try { res.json(await github.getProjects()); }
    catch (error) {
      if (error.code !== 'UPSTREAM_UNAVAILABLE' || !Array.isArray(github.registry)) throw error;
      res.json({projects:github.registry.map(({slug,...project})=>({...project,stats:null,latestRelease:null})),updatedAt:null,stale:true,notice:'GitHub statistics are temporarily unavailable.'});
    }
  });
  api.get('/releases', async (req, res) => {
    const project = parse(z.string().regex(/^[a-z0-9-]{1,40}$/), req.query.project || 'relay');
    res.json(await github.getReleases(project));
  });
  api.get('/content', async (req, res) => res.json(await content.content()));
  api.get('/demo', async (req, res) => res.json(await demo.getSnapshot()));
  api.post('/server-check', ...writes, probeLimit, async (req, res) => {
    const {address} = parse(z.object({address:z.string().trim().min(1).max(260)}), req.body);
    const data = await content.content();
    res.json(await checkServer(address, {versions:data.versions}));
  });
  api.post('/setup-check', ...writes, probeLimit, async (req, res) => {
    const payload = parse(z.object({relayToml:z.string().min(1).max(24576),paperYaml:z.string().min(1).max(24576),serverProperties:z.string().min(1).max(24576)}), req.body);
    res.json(await checkSetup(payload));
  });
  api.post('/configs', ...writes, async (req, res) => {
    const settings = sanitizeSharedSettings(req.body?.settings);
    const record = store.createConfig(settings, config.shareDays);
    res.status(201).json({...record,url:`${config.origin}/c/${record.id}`});
  });
  api.get('/configs/:id', (req, res) => {
    const record = store.getConfig(req.params.id);
    if (!record) throw apiError(404, 'CONFIG_NOT_FOUND', 'This shared config has expired or does not exist.');
    res.json(record);
  });
  api.post('/feedback', ...writes, (req, res) => {
    const {page, helpful} = parse(z.object({page:pageSchema,helpful:z.boolean()}), req.body);
    res.status(201).json(store.vote(page, helpful));
  });
  api.get('/feedback', (req, res) => res.json(store.feedback(parse(pageSchema, req.query.page))));
  api.get('/issue-challenge', limiter(15, 60000), (req, res) => res.json(issues.challenge(req.ip)));
  api.post('/issues', ...writes, issueLimit, globalIssueLimit, async (req, res) => res.status(201).json(await issues.report(parse(reportSchema, req.body), req.ip)));
  api.use((req, res) => res.status(404).json({error:{code:'NOT_FOUND',message:'Unknown API route.'}}));

  app.get('/feed.xml', async (req, res) => res.type('application/rss+xml').send(await content.rss({origin:config.origin || 'https://pustka.sh'})));
  app.get(['/docs','/docs/'], (req,res)=>res.redirect(308,'/docs/projects'));
  app.get(['/docs/api','/docs/api/'], (req,res)=>res.redirect(308,'/api'));
  app.get('/sitemap.xml',async(req,res)=>res.type('application/xml').set('Cache-Control','public, max-age=300').send(await documentationSitemapIndex({documentation,origin:config.origin||'https://pustka.sh',staticPages:pages})));
  app.get('/sitemaps/site.xml',(req,res)=>res.type('application/xml').sendFile(path.join(config.distDir,'sitemap.xml'),{dotfiles:'allow'}));
  app.get('/sitemaps/docs/:project/:version.xml',async(req,res)=>res.type('application/xml').set('Cache-Control','public, max-age=300').send(await documentationVersionSitemap({documentation,origin:config.origin||'https://pustka.sh',project:req.params.project,version:req.params.version})));
  app.use(express.static(config.distDir, {index:false, redirect:false, dotfiles:'deny', maxAge:0, setHeaders(res, file) {
    if (path.basename(path.dirname(file)) === 'assets') res.set('Cache-Control', 'public, max-age=31536000, immutable');
  }}));
  app.get(/^\/c\/[A-Za-z0-9_-]{16}\/?$/, (req, res) => {res.set({'X-Robots-Tag':'noindex, nofollow','Cache-Control':'no-store'}).sendFile(path.join(config.distDir,'index.html'),{dotfiles:'allow'});});
  app.get(/^\/docs\/[a-z][a-z0-9-]{0,39}\/compare\/?$/,async(req,res,next)=>{const project=req.path.split('/')[2];try{await documentation.versions(project);}catch(error){if(error.status===404)return next();throw error;}res.type('html').set('Cache-Control','no-cache').send(documentationHtml(shellHtml,{title:`Compare ${project} documentation — pustka`,description:'Review API declarations and guide changes between published documentation snapshots.',url:`${config.origin||'https://pustka.sh'}/docs/${project}/compare`}));});
  app.get(/^\/docs\/[a-z0-9][a-z0-9-]{0,39}\/(?:main|v?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)(?:\/[a-z0-9][a-z0-9-]{0,79})?\/?$/, async (req,res,next)=>{
    const [,,project,version,slug] = req.path.replace(/\/$/,'').split('/');
    const symbolId=slug==='api'&&typeof req.query.symbol==='string'?req.query.symbol:null;
    let snapshot;
    try {snapshot=await documentation.document(project,version,{slug,symbolId});}
    catch(error){if(error.status!==404)return next(error);return res.status(404).set('X-Robots-Tag','noindex').type('html').send(shellHtml);}
    res.type('html').set('Cache-Control','no-cache').send(renderPublishedDocumentation(shellHtml,{...snapshot,origin:config.origin||'https://pustka.sh',pathname:req.path.replace(/\/$/,''),symbolId}));
  });
  const knownPages = new Set(pages.map(page=>page.path));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const urlPath = req.path.replace(/\/+$/, '') || '/';
    if (!knownPages.has(urlPath)) return next();
    const generated = path.join(config.distDir, urlPath === '/' ? 'index.html' : `${urlPath}/index.html`);
    res.sendFile(existsSync(generated) ? generated : path.join(config.distDir,'index.html'),{dotfiles:'allow'});
  });
  app.use((req, res) => {
    if (req.accepts('html') && existsSync(path.join(config.distDir,'404.html'))) return res.status(404).sendFile(path.join(config.distDir,'404.html'),{dotfiles:'allow'});
    res.status(404).json({error:{code:'NOT_FOUND',message:'Page not found.'}});
  });
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : Number(error.status) || 500;
    const safe = error.expose === true;
    res.status(status >= 400 && status <= 599 ? status : 500).json({error:{code:status === 413 ? 'BODY_TOO_LARGE' : safe && typeof error.code === 'string' ? error.code : 'REQUEST_FAILED',message:status === 413 ? 'This request is too large.' : safe && error.type !== 'entity.parse.failed' ? error.message : status === 400 ? 'Invalid JSON request.' : 'The request could not be completed. Please try again later.'}});
  });
  return {app, config, store, content, github, demo, documentation, close:async () => {await content.close?.();await content.waitForIdle?.();store.close();}};
}
