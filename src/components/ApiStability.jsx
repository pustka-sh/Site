export const stabilityLevels=['supported','experimental','internal','unclassified'];
export const stabilityOf=symbol=>stabilityLevels.includes(symbol?.stability)?symbol.stability:'unclassified';
const explanations={supported:'An intended integration surface within the scope stated by the project.',experimental:'Available for exploration; the project may change this surface.',internal:'Implementation reference. The project does not designate it as an extension API.',unclassified:'This snapshot does not declare a support policy for this symbol.'};

export function ApiStabilityBadge({symbol}){
  const level=stabilityOf(symbol);
  return <span className={`api-stability-badge ${level}`} title={explanations[level]}>{level[0].toUpperCase()+level.slice(1)}</span>;
}

export function ApiStabilityNote({symbol}){
  const level=stabilityOf(symbol);
  return <aside className={`api-stability-note ${level}`} aria-label="API support policy"><ApiStabilityBadge symbol={symbol}/><p>{symbol.stabilityNote||explanations[level]}</p></aside>;
}

export function ApiStabilityLegend(){
  return <details className="api-stability-legend"><summary>What the API labels mean</summary><dl>{stabilityLevels.map(level=><div key={level}><dt><ApiStabilityBadge symbol={{stability:level}}/></dt><dd>{explanations[level]}</dd></div>)}</dl><p>Java visibility is separate from support policy. For Relay, supported wire constants describe protocol integrations; they do not promise a Java plugin interface or binary compatibility. Read the note on the symbol for its scope.</p></details>;
}
