import { forwardRef } from 'react'

const CARD_SIZES = {
  square: { width: 540, height: 540 },
  story: { width: 540, height: 960 },
}

const GOLD_FLECKS = [
  { top: '13%', left: '19%', size: 6, rotate: 18, opacity: 0.6 },
  { top: '18%', right: '18%', size: 8, rotate: -16, opacity: 0.5 },
  { top: '28%', left: '12%', size: 5, rotate: 34, opacity: 0.42 },
  { top: '31%', right: '12%', size: 6, rotate: -28, opacity: 0.45 },
  { top: '43%', left: '18%', size: 4, rotate: 12, opacity: 0.38 },
  { top: '45%', right: '20%', size: 5, rotate: 26, opacity: 0.34 },
  { top: '56%', left: '11%', size: 6, rotate: -20, opacity: 0.32 },
  { top: '59%', right: '13%', size: 4, rotate: 18, opacity: 0.34 },
]

const BadgeShareCard = forwardRef(function BadgeShareCard(
  { badge, displayName, profileName, earnedDate, format = 'story' },
  ref,
) {
  const image = badge?.image || null
  const isSquare = format === 'square'
  const size = CARD_SIZES[isSquare ? 'square' : 'story']
  const imageSize = isSquare ? 194 : 286
  const category = String(badge?.category || badge?.key || '').toLowerCase()
  const stewardshipLine = category.includes('reviewer')
    ? 'I help protect the care, accuracy, and trust behind every piece of Ivatan knowledge.'
    : category.includes('folklore')
      ? 'I help keep Ivatan stories, memory, and cultural imagination alive for the next generation.'
      : category.includes('dictionary')
        ? 'I help carry Ivatan words forward as living threads of language, memory, and identity.'
        : 'I help build a living house of Ivatan heritage, one careful contribution at a time.'

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: `${size.width}px`,
        height: `${size.height}px`,
        overflow: 'hidden',
        fontFamily: "'Averia Serif Libre', Georgia, 'Times New Roman', serif",
        background: 'radial-gradient(ellipse 120% 80% at 50% -8%, #fff8dc 0%, #f7fbea 42%, #eef6df 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxSizing: 'border-box',
      }}
    >
      {/* Subtle woven texture */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(31, 95, 40, 0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(31, 95, 40, 0.025) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          pointerEvents: 'none',
        }}
      />

      {/* Restrained gold flecks: celebratory, not noisy */}
      {GOLD_FLECKS.map((fleck, index) => (
        <span
          key={`badge-fleck-${index}`}
          style={{
            position: 'absolute',
            top: fleck.top,
            left: fleck.left,
            right: fleck.right,
            width: `${fleck.size}px`,
            height: `${fleck.size * 2}px`,
            borderRadius: '999px',
            background: 'linear-gradient(180deg, rgba(214, 165, 52, 0.88), rgba(255, 238, 150, 0.58))',
            boxShadow: '0 1px 5px rgba(145, 112, 36, 0.18)',
            opacity: fleck.opacity,
            transform: `rotate(${fleck.rotate}deg)`,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Warm top glow */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '340px',
          background:
            'radial-gradient(ellipse 90% 65% at 50% -5%, rgba(216, 190, 90, 0.22) 0%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Bottom wash */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '200px',
          background: 'linear-gradient(to top, rgba(31, 95, 40, 0.09) 0%, transparent 100%)',
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
            color: 'rgba(31, 95, 40, 0.58)',
          }}
        >
          Chirin Ivatan
        </p>

        {/* Top rule */}
        <div
          style={{
            width: '44px',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(145, 112, 36, 0.36), transparent)',
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
              width: `${imageSize + 106}px`,
              height: `${imageSize + 106}px`,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(255, 222, 112, 0.44) 0%, rgba(31, 95, 40, 0.1) 55%, transparent 75%)',
              pointerEvents: 'none',
            }}
          />
          {/* Heritage medallion */}
          <div
            style={{
              position: 'absolute',
              width: `${imageSize + 34}px`,
              height: `${imageSize + 34}px`,
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 50% 42%, rgba(255,255,255,0.94) 0%, rgba(255,248,220,0.88) 46%, rgba(226,239,198,0.76) 100%)',
              border: '2px solid rgba(194, 149, 43, 0.42)',
              boxShadow: 'inset 0 0 0 8px rgba(255,255,255,0.34), 0 18px 38px rgba(31, 57, 27, 0.14)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: `${imageSize + 58}px`,
              height: `${imageSize + 58}px`,
              borderRadius: '50%',
              border: '1px solid rgba(31, 95, 40, 0.12)',
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
              background: 'radial-gradient(circle, rgba(255, 255, 255, 0.76) 0%, transparent 65%)',
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
                  'drop-shadow(0 12px 26px rgba(31, 57, 27, 0.22)) drop-shadow(0 0 14px rgba(255, 232, 147, 0.28))',
              }}
            />
          )}
          {!image && (
            <span
              style={{
                position: 'relative',
                zIndex: 1,
                display: 'grid',
                placeItems: 'center',
                width: `${imageSize * 0.72}px`,
                height: `${imageSize * 0.72}px`,
                borderRadius: '50%',
                background: 'linear-gradient(145deg, #1f5f28, #173219)',
                color: '#fff8dc',
                fontSize: isSquare ? '78px' : '108px',
                fontWeight: 800,
                boxShadow: '0 16px 28px rgba(31, 57, 27, 0.22)',
              }}
            >
              {displayName.slice(0, 1)}
            </span>
          )}
        </div>

        {/* Gold divider */}
        <div
          style={{
            width: '56px',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(145, 112, 36, 0.42), transparent)',
            margin: isSquare ? '0 0 10px' : '0 0 18px',
          }}
        />

        {/* Badge name */}
        <h2
          style={{
            margin: isSquare ? '0 0 10px' : '0 0 18px',
            fontFamily: "'Averia Serif Libre', Georgia, serif",
            fontSize: isSquare ? '28px' : '36px',
            fontWeight: 700,
            color: '#132914',
            textAlign: 'center',
            lineHeight: 1.18,
            letterSpacing: '0',
            textShadow: '0 1px 0 rgba(255, 255, 255, 0.7)',
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
            color: 'rgba(79, 95, 63, 0.72)',
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
            color: '#173219',
            letterSpacing: '0',
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
              color: 'rgba(79, 95, 63, 0.68)',
              letterSpacing: '0.04em',
            }}
          >
            {earnedDate}
          </p>
        )}

        <p
          style={{
            maxWidth: isSquare ? '360px' : '410px',
            margin: isSquare ? '12px 0 0' : '22px 0 0',
            fontFamily: "'Averia Serif Libre', Georgia, serif",
            fontSize: isSquare ? '15px' : '20px',
            fontWeight: 600,
            lineHeight: 1.32,
            color: '#2c4729',
            textAlign: 'center',
          }}
        >
          {stewardshipLine}
        </p>

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
              background: 'linear-gradient(90deg, transparent, rgba(31, 95, 40, 0.18), transparent)',
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
              color: 'rgba(31, 95, 40, 0.5)',
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
