/** DEV/PROD + image tag — shared by main header and login page. */
export default function RuntimeEnvBadge({ env, version }) {
  if (!env) return null
  const isProd = env === 'prod'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.08em',
        padding: '5px 10px',
        borderRadius: 6,
        border: isProd ? '1px solid #b91c1c' : '1px solid #ca8a04',
        background: isProd ? '#fef2f2' : '#fffbeb',
        color: isProd ? '#991b1b' : '#a16207',
      }}
    >
      <span>{env.toUpperCase()}</span>
      {version ? (
        <span
          style={{
            fontWeight: 600,
            letterSpacing: '0.04em',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 10,
            opacity: 0.92,
            borderLeft: isProd ? '1px solid #fecaca' : '1px solid #fde68a',
            paddingLeft: 8,
          }}
          title="Docker image tag"
        >
          {version}
        </span>
      ) : null}
    </span>
  )
}
