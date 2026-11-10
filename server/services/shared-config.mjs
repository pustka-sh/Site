import { z } from 'zod';

const address = z.string().trim().min(1).max(260).regex(/^[^\s\r\n]+:\d{1,5}$/);
const boolean = z.boolean().optional();
const number = (min, max) => z.coerce.number().int().min(min).max(max).optional();
const text = max => z.string().max(max).optional();
// This whitelist is deliberately independent of any browser-side sanitization.
// Unknown fields (including all forwarding secrets) are discarded at every level.
const model = z.object({
  bind: address.optional(), motd: text(2000), maxPlayers: number(0, 1000000),
  onlineMode: boolean, showOnlineCount: boolean,
  forwardingMode: z.enum(['modern', 'legacy', 'none']).optional(), secretInFile: boolean,
  servers: z.array(z.object({
    name: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    address, weight: z.coerce.number().min(0.01).max(10000).optional(),
  })).min(1).max(40).optional(),
  tryList: text(2000), balance: z.enum(['least-players', 'round-robin', 'random', 'resource-aware', 'weighted', 'first-available']).optional(),
  clientApi: boolean, backendApi: boolean, fallback: boolean, interceptCommands: boolean,
  compressionThreshold: number(-1, 1048576), compressionLevel: number(-1, 9),
  proxyProtocolSend: boolean, proxyProtocolReceive: boolean, dashboard: boolean,
  dashboardPort: number(1024, 65535), admin: text(64),
  forcedHosts: z.array(z.object({host: z.string().trim().min(1).max(253), server: z.string().trim().min(1).max(64)})).max(40).optional(),
});

export function sanitizeSharedSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Provide config builder settings.'), {status: 400, code: 'INVALID_CONFIG'});
  const parsed = model.safeParse(input);
  if (!parsed.success || Object.keys(parsed.data).length === 0) throw Object.assign(new Error('Some configuration settings are invalid. Review the form and try again.'), {status: 400, code: 'INVALID_CONFIG'});
  return parsed.data;
}
