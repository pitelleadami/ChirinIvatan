import { forwardRef } from 'react'

const CARD_SIZES = {
  square: { width: 540, height: 540 },
  story: { width: 540, height: 960 },
}

const BadgeShareCard = forwardRef(function BadgeShareCard(
  { badge, displayName, profileName, earnedDate, format = 'story' },
  ref,
) {
  const image = badge?.image || null
  const isSquare = format === 'square'
  const size = CARD_SIZES[isSquare ? 'square' : 'story']
  const imageSize = isSquare ? 230 : 336

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: `${size.width}px`,
        height: `${size.height}px`,
        overflow: 'hidden',
        fontFamily: "'Averia Serif Libre', Georgia, 'Times New Roman', serif",
        background: 'radial-gradient(ellipse 160% 90% at 50% -5%, #1e4d28 0%, #0d2010 45%, #060e07 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxSizing: 'border-box',
      }}
    >
      {/* Star dot texture */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.055) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          pointerEvents: 'none',
        }}
      />

      {/* Warm top glow */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '340px',
          background:
            'radial-gradient(ellipse 90% 65% at 50% -5%, rgba(36, 82, 44, 0.7) 0%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Bottom vignette */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '200px',
          background: 'linear-gradient(to top, rgba(4, 9, 5, 0.7) 0%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Content layer */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: isSquare ? '34px 46px 30px' : '58px 48px 46px',
          boxSizing: 'border-box',
        }}
      >
        {/* Site wordmark */}
        <p
          style={{
            margin: isSquare ? '0 0 8px' : '0 0 14px',
            fontFamily: "'Averia Serif Libre', Georgia, serif",
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: 'rgba(245, 237, 204, 0.42)',
          }}
        >
          Chirin Ivatan
        </p>

        {/* Top rule */}
        <div
          style={{
            width: '44px',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(201, 168, 76, 0.55), transparent)',
          }}
        />

        {/* Badge area — takes remaining vertical space */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            width: '100%',
          }}
        >
          {/* Outer ambient glow */}
          <div
            style={{
              position: 'absolute',
              width: `${imageSize + 92}px`,
              height: `${imageSize + 92}px`,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(255, 214, 80, 0.1) 0%, rgba(255, 180, 40, 0.04) 55%, transparent 75%)',
              pointerEvents: 'none',
            }}
          />
          {/* Inner gold glow */}
          <div
            style={{
              position: 'absolute',
              width: `${imageSize + 18}px`,
              height: `${imageSize + 18}px`,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255, 220, 100, 0.18) 0%, transparent 65%)',
              pointerEvents: 'none',
            }}
          />

          {image && (
            <img
              src={image}
              alt={displayName}
              style={{
                width: `${imageSize}px`,
                height: `${imageSize}px`,
                objectFit: 'contain',
                position: 'relative',
                zIndex: 1,
                filter:
                  'drop-shadow(0 6px 28px rgba(0,0,0,0.65)) drop-shadow(0 0 12px rgba(255,214,80,0.18))',
              }}
            />
          )}
        </div>

        {/* Gold divider */}
        <div
          style={{
            width: '56px',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(201, 168, 76, 0.7), transparent)',
            margin: isSquare ? '0 0 12px' : '0 0 20px',
          }}
        />

        {/* Badge name */}
        <h2
          style={{
            margin: isSquare ? '0 0 14px' : '0 0 26px',
            fontFamily: "'Averia Serif Libre', Georgia, serif",
            fontSize: isSquare ? '29px' : '38px',
            fontWeight: 700,
            color: '#f5edcc',
            textAlign: 'center',
            lineHeight: 1.18,
            letterSpacing: '0.01em',
            textShadow: '0 2px 14px rgba(0,0,0,0.55)',
          }}
        >
          {displayName}
        </h2>

        {/* Earned by */}
        <p
          style={{
            margin: '0 0 5px',
            fontFamily: "'Averia Serif Libre', Georgia, serif",
            fontSize: isSquare ? '10px' : '12px',
            fontWeight: 400,
            color: 'rgba(245, 237, 204, 0.45)',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}
        >
          Earned by
        </p>
        <p
          style={{
            margin: '0 0 6px',
            fontFamily: "'Averia Serif Libre', Georgia, serif",
            fontSize: isSquare ? '17px' : '24px',
            fontWeight: 700,
            color: '#f5edcc',
            letterSpacing: '0.03em',
            textAlign: 'center',
          }}
        >
          {profileName}
        </p>

        {earnedDate && (
          <p
            style={{
              margin: '0 0 0',
              fontFamily: "'Averia Serif Libre', Georgia, serif",
              fontSize: isSquare ? '11px' : '15px',
              color: 'rgba(245, 237, 204, 0.35)',
              letterSpacing: '0.04em',
            }}
          >
            {earnedDate}
          </p>
        )}

        {/* Bottom rule + URL */}
        <div
          style={{
            flex: '0 0 auto',
            width: '100%',
            marginTop: 'auto',
            paddingTop: isSquare ? '14px' : '28px',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(201, 168, 76, 0.18), transparent)',
              marginBottom: '12px',
            }}
          />
          <p
            style={{
              margin: 0,
              fontFamily: "'Averia Serif Libre', Georgia, serif",
              fontSize: '9px',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'rgba(245, 237, 204, 0.26)',
              textAlign: 'center',
            }}
          >
            chirinivatan.com
          </p>
        </div>
      </div>
    </div>
  )
})

export default BadgeShareCard
