/** An endless horizontal ticker; content is duplicated so the loop is seamless. */
export default function Marquee({ items, note }) {
  const row = (hidden) => (
    <div className="marquee-row" aria-hidden={hidden || undefined}>
      {items.map((item, i) => (
        <span key={i}><b>{String(i + 1).padStart(2, '0')}</b> {item}<i aria-hidden="true">∅</i></span>
      ))}
      {note && <span className="strip-note">{note}<i aria-hidden="true">∅</i></span>}
    </div>
  );
  return (
    <div className="marquee">
      <div className="marquee-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
