/*
  LeaderboardPage.jsx

  Public Hall of Stewards:
  - live archive counts
  - contributor rankings
  - municipality standings
  - monthly winner history
*/

import { useEffect, useMemo, useRef, useState } from 'react'
import { toPng } from 'html-to-image'

import { apiRequest } from '../lib/api'
import { compactLeaderboardName } from '../lib/leaderboardDisplay'
import { getMunicipalityFlag } from '../lib/municipalityFlags'
import { ROUTES, navigate } from '../lib/router'
import { copyShareText, downloadBlob, shareImageNative } from '../lib/socialShare'
import logoSrc from '../assets/brand/chirin-ivatan-logo.png'

const METRIC_OPTIONS = ['combined', 'dictionary', 'folklore']
const PERIOD_OPTIONS = ['monthly', 'all_time']
const MUNICIPALITIES = ['All', 'Basco', 'Mahatao', 'Ivana', 'Uyugan', 'Sabtang', 'Itbayat']
const RANKED_MUNICIPALITIES = MUNICIPALITIES.filter((item) => item !== 'All')
const EMPTY_ARCHIVE_COUNTS = {
  dictionaryLive: 0,
  folkloreLive: 0,
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function withCompetitionRank(rows, valueKey = 'value') {
  const sorted = [...rows].sort((a, b) => toNumber(b[valueKey]) - toNumber(a[valueKey]))
  let previousValue = null
  let previousRank = 0
  return sorted.map((row, index) => {
    const currentValue = toNumber(row[valueKey])
    const rank = currentValue === previousValue ? previousRank : index + 1
    previousValue = currentValue
    previousRank = rank
    return { ...row, rank }
  })
}

function metricLabel(value) {
  if (value === 'dictionary') return 'Dictionary'
  if (value === 'folklore') return 'Folklore'
  return 'Combined'
}

function periodLabel(value) {
  if (value === 'all_time') return 'All Time'
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

function contributorName(row) {
  return compactLeaderboardName(
    row.display_name || row.full_name || row.name || row.username || 'Contributor',
  )
}

function municipalityScore(row, metric, period) {
  const metricKey = metric === 'combined' ? 'combined' : metric
  const periodKey = period === 'all_time' ? 'all_time' : 'month'
  return toNumber(row[`${metricKey}_${periodKey}`])
}

// ─── Share card (rendered offscreen, captured as PNG) ──────────────────────

const STORY_W = 540
const STORY_H = 960 // 9:16 portrait → 1080×1920 at 2×
const POST_W = 720
const POST_H = 720 // 1:1 square → 2160×2160 at 3×

function isPhoneShareDevice() {
  if (typeof navigator === 'undefined') return false
  const userAgent = navigator.userAgent || ''
  const hasCoarsePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  return /iPhone|iPod|Android/i.test(userAgent) || (hasCoarsePointer && /Mobile|Safari/i.test(userAgent))
}

async function waitForCardImages(node) {
  const images = Array.from(node?.querySelectorAll?.('img') || [])
  await Promise.all(
    images.map((image) => {
      if (image.complete && image.naturalWidth > 0) return Promise.resolve()
      return new Promise((resolve) => {
        const finish = () => resolve()
        const timeout = setTimeout(finish, 2500)
        const done = () => {
          clearTimeout(timeout)
          finish()
        }
        if (image.complete) {
          done()
          return
        }
        image.addEventListener('load', done, { once: true })
        image.addEventListener('error', done, { once: true })
      })
    }),
  )
  await Promise.all(images.map((image) => image.decode?.().catch(() => undefined) || Promise.resolve()))
}

// Podium colors — warm accents against the site's light sage base
const PODIUM = {
  1: { block: '#c8a84b', blockDark: '#a8873a', text: '#fff', rankText: '#fff', blockH: 110 },
  2: { block: '#4a7c59', blockDark: '#3a6347', text: '#fff', rankText: '#fff', blockH: 80 },
  3: { block: '#8c9e7c', blockDark: '#7a8d6a', text: '#fff', rankText: '#fff', blockH: 60 },
}

function CardAvatar({ src, initial, size, border }) {
  const base = {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    background: '#e6efc6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#1f5f28',
    fontSize: `${Math.round(size * 0.38)}px`,
    fontWeight: 700,
    flexShrink: 0,
    overflow: 'hidden',
    border: border || '3px solid #fff',
    boxShadow: 'none',
  }
  return src ? (
    <img src={src} style={{ ...base, objectFit: 'cover' }} alt="" crossOrigin="anonymous" />
  ) : (
    <span style={base}>{initial}</span>
  )
}

function PodiumSlot({ row, rank, isMe, isTall }) {
  if (!row) return <div style={{ flex: 1 }} />
  const cfg = PODIUM[rank] || PODIUM[3]
  const avatarSize = isTall ? 72 : 58
  const name = contributorName(row)
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {isMe && (
        <div
          style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#c8a84b',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '4px',
          }}
        >
          You
        </div>
      )}
      <CardAvatar
        src={row.profile_photo}
        initial={name.slice(0, 1)}
        size={avatarSize}
        border={isMe ? '3px solid #c8a84b' : '3px solid #fff'}
      />
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: '#122312',
          marginTop: '7px',
          maxWidth: '110px',
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </div>
      <div style={{ fontSize: '10px', color: '#596553', marginTop: '2px' }}>{row.value} pts</div>
      {/* Podium block */}
      <div
        style={{
          width: '100%',
          height: `${cfg.blockH}px`,
          marginTop: '8px',
          background: `linear-gradient(180deg, ${cfg.block} 0%, ${cfg.blockDark} 100%)`,
          borderRadius: '8px 8px 0 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isMe ? '0 0 0 2px #c8a84b' : 'none',
        }}
      >
        <span
          style={{ fontSize: isTall ? '36px' : '28px', fontWeight: 900, color: cfg.rankText, opacity: 0.9 }}
        >
          {rank}
        </span>
      </div>
    </div>
  )
}

function ListRow({ row, isMe, showYouBadge }) {
  const name = contributorName(row)
  const initial = name.slice(0, 1).toUpperCase()
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        padding: isMe ? '11px 14px' : '9px 14px',
        borderRadius: '10px',
        background: isMe ? '#1f5f28' : '#ffffff',
        border: isMe ? '1.5px solid #1f5f28' : '1px solid #d2dcc8',
        boxShadow: 'none',
      }}
    >
      <span
        style={{
          color: isMe ? 'rgba(255,255,255,0.7)' : '#8fa888',
          fontSize: '12px',
          fontWeight: 700,
          width: '26px',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {String(row.rank).padStart(2, '0')}
      </span>
      <CardAvatar
        src={row.profile_photo}
        initial={initial}
        size={32}
        border={isMe ? '2px solid rgba(255,255,255,0.45)' : '2px solid #e6efc6'}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              color: isMe ? '#fff' : '#122312',
              fontSize: '13px',
              fontWeight: isMe ? 700 : 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {name}
          </span>
          {showYouBadge && (
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: '#c8a84b',
                background: 'rgba(200,168,75,0.18)',
                padding: '1px 6px',
                borderRadius: '20px',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              You
            </span>
          )}
        </div>
        <div
          style={{ color: isMe ? 'rgba(255,255,255,0.6)' : '#8fa888', fontSize: '11px', marginTop: '1px' }}
        >
          {row.municipality || 'Batanes'}
        </div>
      </div>
      <span style={{ color: isMe ? '#fff' : '#596553', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>
        {row.value} pts
      </span>
    </div>
  )
}

function MuniRow({ row, isMe }) {
  const flag = getMunicipalityFlag(row.municipality)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        padding: isMe ? '11px 14px' : '9px 14px',
        borderRadius: '10px',
        background: isMe ? '#1f5f28' : '#ffffff',
        border: isMe ? '1.5px solid #1f5f28' : '1px solid #d2dcc8',
        boxShadow: 'none',
      }}
    >
      <span
        style={{
          color: isMe ? 'rgba(255,255,255,0.7)' : '#8fa888',
          fontSize: '12px',
          fontWeight: 700,
          width: '26px',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        {String(row.rank).padStart(2, '0')}
      </span>
      {flag ? (
        <img
          src={flag}
          style={{
            width: '36px',
            height: '28px',
            objectFit: 'contain',
            objectPosition: 'center',
            borderRadius: '4px',
            flexShrink: 0,
          }}
          alt=""
          crossOrigin="anonymous"
        />
      ) : (
        <span
          style={{
            width: '36px',
            height: '28px',
            borderRadius: '4px',
            background: '#e6efc6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            color: '#596553',
            flexShrink: 0,
          }}
        >
          {row.municipality?.slice(0, 1)}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: isMe ? '#fff' : '#122312', fontSize: '13px', fontWeight: isMe ? 700 : 500 }}>
            {row.municipality}
          </span>
          {isMe && (
            <span
              style={{
                fontSize: '9px',
                fontWeight: 700,
                color: '#c8a84b',
                background: 'rgba(200,168,75,0.18)',
                padding: '1px 6px',
                borderRadius: '20px',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              Your town
            </span>
          )}
        </div>
        <div
          style={{ color: isMe ? 'rgba(255,255,255,0.6)' : '#8fa888', fontSize: '11px', marginTop: '1px' }}
        >
          {row.dictionary} dict · {row.folklore} folklore
        </div>
      </div>
      <span style={{ color: isMe ? '#fff' : '#596553', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}>
        {row.score} pts
      </span>
    </div>
  )
}

function MuniPodiumSlot({ row, rank, isMe, isTall }) {
  if (!row) return <div style={{ flex: 1 }} />
  const cfg = PODIUM[rank] || PODIUM[3]
  const flag = getMunicipalityFlag(row.municipality)
  const flagSize = isTall ? 52 : 42
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {isMe && (
        <div
          style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#c8a84b',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '4px',
          }}
        >
          Your town
        </div>
      )}
      {flag ? (
        <img
          src={flag}
          style={{
            width: `${flagSize + 22}px`,
            height: `${flagSize + 6}px`,
            objectFit: 'contain',
            objectPosition: 'center',
            borderRadius: '6px',
            flexShrink: 0,
          }}
          alt=""
          crossOrigin="anonymous"
        />
      ) : (
        <span
          style={{
            width: `${flagSize + 22}px`,
            height: `${flagSize + 6}px`,
            borderRadius: '6px',
            background: '#e6efc6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: 700,
            color: '#1f5f28',
          }}
        >
          {row.municipality?.slice(0, 1)}
        </span>
      )}
      <div
        style={{ fontSize: '11px', fontWeight: 600, color: '#122312', marginTop: '7px', textAlign: 'center' }}
      >
        {row.municipality}
      </div>
      <div style={{ fontSize: '10px', color: '#596553', marginTop: '2px' }}>{row.score} pts</div>
      <div
        style={{
          width: '100%',
          height: `${cfg.blockH}px`,
          marginTop: '8px',
          background: `linear-gradient(180deg, ${cfg.block} 0%, ${cfg.blockDark} 100%)`,
          borderRadius: '8px 8px 0 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: isMe ? '0 0 0 2px #c8a84b' : 'none',
        }}
      >
        <span
          style={{ fontSize: isTall ? '36px' : '28px', fontWeight: 900, color: cfg.rankText, opacity: 0.9 }}
        >
          {rank}
        </span>
      </div>
    </div>
  )
}

function CardHeader({ title, subtitle }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px',
        marginBottom: '20px',
        paddingBottom: '12px',
        borderBottom: '1px solid rgba(31,95,40,0.16)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0 }}>
        <img
          src={logoSrc}
          style={{ width: '40px', height: '40px', objectFit: 'contain' }}
          alt=""
          crossOrigin="anonymous"
        />
        <div>
          <div
            style={{
              color: '#122312',
              fontSize: '24px',
              fontWeight: 800,
              fontFamily: "'Lora', Georgia, serif",
            }}
          >
            {title}
          </div>
          <div
            style={{
              color: '#596553',
              fontSize: '10px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginTop: '2px',
            }}
          >
            {subtitle}
          </div>
        </div>
      </div>
      <div
        style={{
          color: '#1f5f28',
          fontFamily: "'Lora', Georgia, serif",
          fontSize: '18px',
          fontWeight: 800,
          whiteSpace: 'nowrap',
        }}
      >
        Chirin Ivatan
      </div>
    </div>
  )
}

function CardFooter({ date }) {
  return (
    <div style={{ marginTop: 'auto', display: 'grid', gap: '8px' }}>
      <div
        style={{
          borderTop: '1px solid rgba(31,95,40,0.16)',
          borderBottom: '1px solid rgba(31,95,40,0.1)',
          padding: '13px 10px 12px',
          background: 'rgba(230,239,198,0.48)',
        }}
      >
        <p
          style={{
            margin: 0,
            color: '#243b24',
            fontFamily: "'Lora', Georgia, serif",
            fontSize: '18px',
            fontStyle: 'italic',
            fontWeight: 700,
            lineHeight: 1.22,
            textAlign: 'center',
          }}
        >
          “Building a Digital Ivatan House of Heritage, One Contribution at a Time.”
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <span style={{ color: '#53634d', fontSize: '10px', fontWeight: 500, letterSpacing: '0.08em' }}>
          www.chirinivatan.com
        </span>
        <span style={{ color: '#9bac93', fontSize: '10px', whiteSpace: 'nowrap' }}>{date}</span>
      </div>
    </div>
  )
}

function ShareButtons({ kind, openShareCard }) {
  return (
    <div className="share-action-row" style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="badge-share-icon-btn"
        title="Share"
        onClick={() => openShareCard(kind)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          width="16"
          height="16"
          aria-hidden="true"
        >
          <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </button>
    </div>
  )
}

function LeaderboardShareCardIndividual({
  rows,
  myUsername,
  metric,
  period,
  todayLabel,
  cardRef,
  format = 'story',
}) {
  const isPost = format === 'post'
  const cardW = isPost ? POST_W : STORY_W
  const cardH = isPost ? POST_H : STORY_H
  const top3 = rows.slice(0, 3)
  const myIdx = rows.findIndex((r) => r.username === myUsername)
  const myRow = myIdx >= 0 ? rows[myIdx] : null
  const listRows = (() => {
    if (!isPost) return rows.slice(3, 7)
    if (myIdx >= 3) {
      const afterUserRows = rows.slice(myIdx, Math.min(rows.length, myIdx + 4))
      if (afterUserRows.length >= 3 || myIdx === 3) return afterUserRows
      return rows.slice(Math.max(3, myIdx - (3 - afterUserRows.length)), rows.length)
    }
    return rows.slice(3, 7)
  })()
  const myIsBelow = !isPost && myRow && myIdx >= 7
  const myIsInTop3 = top3.some((r) => r.username === myUsername)

  return (
    <div
      ref={cardRef}
      style={{
        width: `${cardW}px`,
        height: `${cardH}px`,
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        background: 'linear-gradient(180deg, #fbfdf8 0%, #f0f6e8 100%)',
        display: 'flex',
        flexDirection: 'column',
        padding: isPost ? '30px 34px 26px' : '32px 28px 24px',
        boxSizing: 'border-box',
        border: '1px solid rgba(31,95,40,0.12)',
      }}
    >
      <CardHeader title="Hall of Stewards" subtitle={`${metricLabel(metric)} · ${periodLabel(period)}`} />

      {/* Podium */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', marginBottom: '0' }}>
        <PodiumSlot
          row={top3[1]}
          rank={2}
          isMe={myIsInTop3 && top3[1]?.username === myUsername}
          isTall={false}
        />
        <PodiumSlot row={top3[0]} rank={1} isMe={myIsInTop3 && top3[0]?.username === myUsername} isTall />
        <PodiumSlot
          row={top3[2]}
          rank={3}
          isMe={myIsInTop3 && top3[2]?.username === myUsername}
          isTall={false}
        />
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: '#d2dcc8', margin: '14px 0 12px' }} />

      {isPost && myIdx >= 3 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 10px' }}>
          <div style={{ flex: 1, height: '1px', background: '#d2dcc8' }} />
          <span
            style={{
              color: '#8fa888',
              fontSize: '10px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            You and nearby stewards
          </span>
          <div style={{ flex: 1, height: '1px', background: '#d2dcc8' }} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {listRows.map((row) => (
          <ListRow
            key={row.username}
            row={row}
            isMe={row.username === myUsername}
            showYouBadge={row.username === myUsername}
          />
        ))}
      </div>

      {/* User row if outside top 7 */}
      {myIsBelow && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0 8px' }}>
            <div style={{ flex: 1, height: '1px', background: '#d2dcc8' }} />
            <span style={{ color: '#a8b8a0', fontSize: '10px', letterSpacing: '0.04em' }}>Your rank</span>
            <div style={{ flex: 1, height: '1px', background: '#d2dcc8' }} />
          </div>
          <ListRow row={myRow} isMe showYouBadge />
        </>
      )}

      <CardFooter date={todayLabel} />
    </div>
  )
}

function LeaderboardShareCardMunicipality({
  rankedMunicipalities,
  myMunicipality,
  metric,
  period,
  todayLabel,
  cardRef,
  format = 'story',
}) {
  const isPost = format === 'post'
  const cardW = isPost ? POST_W : STORY_W
  const cardH = isPost ? POST_H : STORY_H
  const top3 = rankedMunicipalities.slice(0, 3)
  const rest = rankedMunicipalities.slice(3)
  const progress = rankedMunicipalities.reduce(
    (totals, row) => ({
      dictionary: totals.dictionary + toNumber(row.dictionary),
      folklore: totals.folklore + toNumber(row.folklore),
    }),
    { dictionary: 0, folklore: 0 },
  )
  const progressTotal = progress.dictionary + progress.folklore
  const progressPeriod = period === 'all_time' ? 'all time' : 'this month'

  return (
    <div
      ref={cardRef}
      style={{
        width: `${cardW}px`,
        height: `${cardH}px`,
        fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
        background: 'linear-gradient(180deg, #fbfdf8 0%, #f0f6e8 100%)',
        display: 'flex',
        flexDirection: 'column',
        padding: isPost ? '30px 34px 26px' : '32px 28px 24px',
        boxSizing: 'border-box',
        border: '1px solid rgba(31,95,40,0.12)',
      }}
    >
      <CardHeader
        title="Municipality Standings"
        subtitle={`${metricLabel(metric)} · ${periodLabel(period)}`}
      />

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', marginBottom: '0' }}>
        <MuniPodiumSlot
          row={top3[1]}
          rank={2}
          isMe={top3[1]?.municipality === myMunicipality}
          isTall={false}
        />
        <MuniPodiumSlot row={top3[0]} rank={1} isMe={top3[0]?.municipality === myMunicipality} isTall />
        <MuniPodiumSlot
          row={top3[2]}
          rank={3}
          isMe={top3[2]?.municipality === myMunicipality}
          isTall={false}
        />
      </div>

      <div style={{ height: '1px', background: '#d2dcc8', margin: '14px 0 12px' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {rest.map((row) => (
          <MuniRow key={row.municipality} row={row} isMe={row.municipality === myMunicipality} />
        ))}
      </div>

      <div
        style={{
          margin: isPost ? '28px 0 0' : '34px 0 0',
          padding: isPost ? '18px 20px' : '20px 18px',
          borderTop: '1px solid rgba(31,95,40,0.12)',
          borderBottom: '1px solid rgba(31,95,40,0.1)',
          background: 'rgba(255,255,255,0.38)',
        }}
      >
        <div
          style={{
            color: '#1f5f28',
            fontSize: '11px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            textAlign: 'center',
          }}
        >
          Community Progress
        </div>
        <div
          style={{
            marginTop: '8px',
            color: '#122312',
            fontFamily: "'Lora', Georgia, serif",
            fontSize: isPost ? '26px' : '28px',
            fontWeight: 800,
            lineHeight: 1,
            textAlign: 'center',
          }}
        >
          {progressTotal}
        </div>
        <div
          style={{
            marginTop: '5px',
            color: '#596553',
            fontSize: '12px',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          total contributions {progressPeriod}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px',
            marginTop: '14px',
          }}
        >
          <div
            style={{
              border: '1px solid rgba(31,95,40,0.12)',
              borderRadius: '8px',
              padding: '10px 8px',
              background: 'rgba(240,246,232,0.62)',
              textAlign: 'center',
            }}
          >
            <strong style={{ display: 'block', color: '#122312', fontSize: '19px', lineHeight: 1 }}>
              {progress.dictionary}
            </strong>
            <span style={{ display: 'block', marginTop: '4px', color: '#596553', fontSize: '11px' }}>
              dictionary entries
            </span>
          </div>
          <div
            style={{
              border: '1px solid rgba(31,95,40,0.12)',
              borderRadius: '8px',
              padding: '10px 8px',
              background: 'rgba(240,246,232,0.62)',
              textAlign: 'center',
            }}
          >
            <strong style={{ display: 'block', color: '#122312', fontSize: '19px', lineHeight: 1 }}>
              {progress.folklore}
            </strong>
            <span style={{ display: 'block', marginTop: '4px', color: '#596553', fontSize: '11px' }}>
              folklore records
            </span>
          </div>
        </div>
      </div>

      <CardFooter date={todayLabel} />
    </div>
  )
}

export default function LeaderboardPage({ currentUser = {} }) {
  const [metric, setMetric] = useState('combined')
  const [period, setPeriod] = useState('monthly')
  const [municipality, setMunicipality] = useState('All')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [generatingCard, setGeneratingCard] = useState(false)
  const [sharingCard, setSharingCard] = useState(false)
  const [shareToast, setShareToast] = useState('')
  const [shareModal, setShareModal] = useState(null) // { dataUrl, kind, format, shareText, shareUrl }
  const individualStoryRef = useRef(null)
  const individualPostRef = useRef(null)
  const municipalityStoryRef = useRef(null)
  const municipalityPostRef = useRef(null)

  const [globalRows, setGlobalRows] = useState([])
  const [municipalityRows, setMunicipalityRows] = useState([])
  const [municipalityTotals, setMunicipalityTotals] = useState([])
  const [archiveCounts, setArchiveCounts] = useState(EMPTY_ARCHIVE_COUNTS)
  const phoneShareDevice = isPhoneShareDevice()

  const todayLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date())

  const shownRows = municipality === 'All' ? globalRows : municipalityRows
  const rankedContributorRows = withCompetitionRank(shownRows, 'value').slice(0, 20)
  const isAuthenticated = Boolean(currentUser?.is_authenticated)
  const isAdmin = currentUser?.is_superuser || (currentUser?.groups || []).includes('Admin')
  const myUsername = String(currentUser?.username || '').trim()
  const myMunicipality = String(currentUser?.municipality || '').trim()

  const rankedMunicipalities = useMemo(() => {
    const totalsByMunicipality = new Map(municipalityTotals.map((row) => [row.municipality, row]))
    return withCompetitionRank(
      RANKED_MUNICIPALITIES.map((municipalityName) => {
        const row = totalsByMunicipality.get(municipalityName) || { municipality: municipalityName }
        return {
          municipality: municipalityName,
          score: municipalityScore(row, metric, period),
          dictionary:
            period === 'all_time' ? toNumber(row.dictionary_all_time) : toNumber(row.dictionary_month),
          folklore: period === 'all_time' ? toNumber(row.folklore_all_time) : toNumber(row.folklore_month),
        }
      }),
      'score',
    )
  }, [metric, municipalityTotals, period])

  const winningMunicipality = rankedMunicipalities[0] || {
    municipality: 'Basco',
    score: 0,
    rank: 1,
  }
  const winningFlag = getMunicipalityFlag(winningMunicipality.municipality)
  const myContributorRow = rankedContributorRows.find((row) => row.username === myUsername) || null
  const myMunicipalityRow = rankedMunicipalities.find((row) => row.municipality === myMunicipality) || null

  function toast(msg) {
    setShareToast(msg)
    setTimeout(() => setShareToast(''), 5000)
  }

  function leaderboardShareCaption(kind) {
    if (kind === 'municipality') {
      const municipalityName = myMunicipalityRow?.municipality || myMunicipality || 'our municipality'
      return `${municipalityName} is part of the Chirin Ivatan Hall of Stewards. This recognition belongs to our shared work of remembering, preserving, and passing forward Ivatan language, stories, and cultural heritage.`
    }
    const rank = myContributorRow?.rank || '-'
    const contributions = myContributorRow?.value ?? 0
    return `🏆 Hall of Stewards — Rank #${rank}
${contributions} approved contributions to the Chirin Ivatan archive.

Honoring the heritage entrusted to us by those who came before. Join us in this Digital Yaru and help keep Chirin Ivatan alive!`
  }

  async function generateShareCard(kind, format, base = {}) {
    setGeneratingCard(true)
    setShareModal((current) =>
      current ? { ...current, format, dataUrl: '', status: 'Preparing share image...' } : current,
    )

    let dataUrl = null
    try {
      const refMap = {
        'individual-story': individualStoryRef,
        'individual-post': individualPostRef,
        'municipality-story': municipalityStoryRef,
        'municipality-post': municipalityPostRef,
      }
      const ref = refMap[`${kind}-${format}`]
      if (ref?.current) {
        await waitForCardImages(ref.current)
        dataUrl = await toPng(ref.current, { pixelRatio: format === 'post' ? 3 : 2.5, cacheBust: true })
      }
    } catch {
      setGeneratingCard(false)
      setShareModal((current) =>
        current ? { ...current, status: 'Could not generate the card. Try refreshing.' } : current,
      )
      return
    }

    setGeneratingCard(false)
    if (!dataUrl) {
      setShareModal((current) =>
        current ? { ...current, status: 'Card not ready yet. Try again in a moment.' } : current,
      )
      return
    }

    setShareModal((current) =>
      current ? { ...current, ...base, kind, format, dataUrl, status: '' } : current,
    )
  }

  async function openShareCard(kind) {
    const shareTarget = kind === 'municipality' ? myMunicipalityRow : myContributorRow
    if (!shareTarget) return

    const shareUrl = `${window.location.origin}${ROUTES.leaderboards}`
    const shareText = leaderboardShareCaption(kind)
    const filenameBase = kind === 'municipality' ? 'chirin-ivatan-municipality' : 'chirin-ivatan-steward'
    const base = {
      title: kind === 'municipality' ? 'Share municipality recognition' : 'Share Hall of Stewards rank',
      shareText,
      shareUrl,
      filenameBase,
    }
    setShareModal({ ...base, kind, format: 'post', dataUrl: '', status: 'Preparing share image...' })
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await generateShareCard(kind, 'post', base)
  }

  async function shareBlobFromModal() {
    if (!shareModal) return
    const response = await fetch(shareModal.dataUrl)
    const formatName = shareModal.format === 'story' ? 'vertical-story' : 'square-post'
    return {
      blob: await response.blob(),
      filename: `${shareModal.filenameBase}-${formatName}.png`,
      title: shareModal.title,
    }
  }

  async function shareFromModal() {
    if (!shareModal) return
    setSharingCard(true)
    try {
      const copied = await copyShareText({ text: shareModal.shareText, url: shareModal.shareUrl })
      const payload = await shareBlobFromModal()
      if (!payload) return
      const didShare = await shareImageNative(payload.blob, payload.filename, {
        title: payload.title,
        text: shareModal.shareText,
        url: shareModal.shareUrl,
      })
      if (!didShare) {
        toast(
          copied
            ? 'Caption copied.'
            : phoneShareDevice
              ? 'Sharing is not available here. Please copy the caption manually.'
              : 'Sharing is not available here.',
        )
        return
      }
      toast(copied ? 'Share sheet opened. Caption copied.' : 'Share sheet opened.')
      setShareModal(null)
    } finally {
      setSharingCard(false)
    }
  }

  async function downloadFromModal() {
    if (!shareModal) return
    const payload = await shareBlobFromModal()
    if (!payload) return
    const { blob, filename } = payload
    downloadBlob(blob, filename)
    await copyShareText({ text: shareModal.shareText, url: shareModal.shareUrl })
    toast('Image downloaded and caption copied.')
    setShareModal(null)
  }

  async function run(requestFn) {
    setLoading(true)
    setError('')
    try {
      await requestFn()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadArchiveCounts() {
    try {
      const [dictionaryPayload, folklorePayload] = await Promise.all([
        apiRequest('/api/dictionary/entries?limit=1'),
        apiRequest('/api/folklore/entries'),
      ])
      setArchiveCounts({
        dictionaryLive: dictionaryPayload.counts?.visible_total ?? dictionaryPayload.counts?.approved ?? 0,
        folkloreLive: folklorePayload.counts?.visible_total ?? folklorePayload.counts?.approved ?? 0,
      })
    } catch {
      setArchiveCounts(EMPTY_ARCHIVE_COUNTS)
    }
  }

  async function loadGlobalRanking() {
    const payload = await apiRequest(`/api/leaderboard/global?metric=${metric}&period=${period}`)
    setGlobalRows(payload.rows || [])
  }

  async function loadMunicipalityRanking() {
    if (municipality === 'All') {
      setMunicipalityRows([])
      return
    }
    const payload = await apiRequest(
      `/api/leaderboard/municipality?municipality=${encodeURIComponent(municipality)}&metric=${metric}&period=${period}`,
    )
    setMunicipalityRows(payload.rows || [])
  }

  async function loadMunicipalityTotals() {
    const payload = await apiRequest('/api/leaderboard/municipalities')
    setMunicipalityTotals(payload.rows || [])
  }

  async function refreshLeaderboard() {
    await run(async () => {
      await loadArchiveCounts()
      await loadMunicipalityTotals()
      await loadGlobalRanking()
      await loadMunicipalityRanking()
    })
  }

  useEffect(() => {
    loadArchiveCounts()
    loadMunicipalityTotals().catch(() => setMunicipalityTotals([]))
  }, [])

  useEffect(() => {
    run(async () => {
      await loadGlobalRanking()
      await loadMunicipalityRanking()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, period, municipality])

  return (
    <section className="leaderboard-page">
      <section className="leaderboard-hero">
        <div>
          <h1>Hall of Stewards</h1>
          <p className="muted leaderboard-hero-subtitle">
            Recognizing the individuals and communities safeguarding our shared heritage, because every
            contribution strengthens the future of Ivatan language and folklore.
          </p>
        </div>
        <article className="archive-count-card archive-count-inline">
          <div className="archive-count-grid">
            <div>
              <p className="stat-value">{archiveCounts.dictionaryLive}</p>
              <p className="stat-label">Dictionary Terms</p>
            </div>
            <div>
              <p className="stat-value">{archiveCounts.folkloreLive}</p>
              <p className="stat-label">Folklore Entries</p>
            </div>
          </div>
          <h3>Total Live Entries as of {todayLabel}</h3>
        </article>
      </section>

      {isAdmin && error && <section className="alert error">{error}</section>}
      {isAdmin && generatingCard && <section className="alert ok">Generating card…</section>}
      {isAdmin && !generatingCard && shareToast && <section className="alert ok">{shareToast}</section>}

      <section className="leaderboard-controls" aria-label="Leaderboard filters">
        <label className="field" htmlFor="lb-metric">
          <span>Recognition</span>
          <select id="lb-metric" value={metric} onChange={(event) => setMetric(event.target.value)}>
            {METRIC_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {metricLabel(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="field" htmlFor="lb-period">
          <span>Period</span>
          <select id="lb-period" value={period} onChange={(event) => setPeriod(event.target.value)}>
            {PERIOD_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {periodLabel(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="field" htmlFor="lb-municipality">
          <span>Municipality</span>
          <select
            id="lb-municipality"
            value={municipality}
            onChange={(event) => setMunicipality(event.target.value)}
          >
            {MUNICIPALITIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="ghost compact-button leaderboard-refresh-button"
          disabled={loading}
          onClick={refreshLeaderboard}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </section>

      <section className="leaderboard-results-grid">
        <article className="panel leaderboard-panel leaderboard-full-panel leaderboard-individual-column">
          <div className="section-heading">
            <div>
              <h3>
                {municipality === 'All' ? 'Individual Ranking' : `Individual Ranking · ${municipality}`}
              </h3>
              {isAuthenticated && myContributorRow && (
                <ShareButtons kind="individual" openShareCard={openShareCard} />
              )}
            </div>
            {loading && <span className="badge status-pending">Loading</span>}
          </div>

          {rankedContributorRows.length === 0 ? (
            <p className="muted">No ranking rows found yet.</p>
          ) : (
            <div className="table-wrap leaderboard-ranking-scroll">
              <table className="simple-table leaderboard-individual-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Steward</th>
                    <th>Score</th>
                    <th>Recognition</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedContributorRows.map((row) => (
                    <tr key={`${row.username}-${row.metric}-${row.period}`}>
                      <td>{row.rank}</td>
                      <td>
                        <button
                          type="button"
                          className="leaderboard-person leaderboard-person-button"
                          onClick={() =>
                            navigate(`${ROUTES.profileView}?username=${encodeURIComponent(row.username)}`)
                          }
                        >
                          {row.profile_photo ? (
                            <img className="leaderboard-avatar" src={row.profile_photo} alt="" />
                          ) : (
                            <span className="leaderboard-avatar" aria-hidden="true">
                              {contributorName(row).slice(0, 1)}
                            </span>
                          )}
                          <span className="leaderboard-person-text">
                            <span>{contributorName(row)}</span>
                            <span className="meta">@{row.username}</span>
                          </span>
                        </button>
                      </td>
                      <td>{row.value}</td>
                      <td>
                        {row.current_contributor_title || row.current_reviewer_title || 'Cultural Steward'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <aside className="leaderboard-side-stack leaderboard-municipality-column">
          <article className="leaderboard-standings-card">
            <h3>Municipality Ranking</h3>
            {isAuthenticated && myMunicipalityRow && (
              <ShareButtons kind="municipality" openShareCard={openShareCard} />
            )}
            <div className="leaderboard-municipality-list">
              <div className="municipality-leading-row">
                <div className="municipality-leading-flag-wrap">
                  {winningFlag ? (
                    <img className="municipality-flag" src={winningFlag} alt="" />
                  ) : (
                    <span className="municipality-flag" aria-hidden="true">
                      {winningMunicipality.municipality?.slice(0, 1) || 'Y'}
                    </span>
                  )}
                </div>
                <div className="municipality-leading-text">
                  <p
                    className={`stat-value${String(winningMunicipality.municipality || '').length >= 7 ? ' long-name' : ''}`}
                  >
                    {winningMunicipality.municipality}
                  </p>
                  <p className="meta">
                    Rank: {winningMunicipality.rank} · Score: {winningMunicipality.score}
                  </p>
                </div>
              </div>

              {rankedMunicipalities.slice(1).map((row) => {
                const flag = getMunicipalityFlag(row.municipality)
                return (
                  <div key={row.municipality} className="leaderboard-municipality-row">
                    <span className="municipality-rank-number">{row.rank}</span>
                    {flag ? (
                      <img className="municipality-flag municipality-flag-small" src={flag} alt="" />
                    ) : (
                      <span className="municipality-flag municipality-flag-small" aria-hidden="true">
                        {row.municipality?.slice(0, 1) || 'M'}
                      </span>
                    )}
                    <span>{row.municipality}</span>
                    <strong>{row.score}</strong>
                  </div>
                )
              })}
            </div>
          </article>
        </aside>
      </section>

      {/* Share export modal */}
      {shareModal && (
        <div className="share-card-modal-overlay" onClick={() => setShareModal(null)}>
          <div className="share-card-modal" onClick={(e) => e.stopPropagation()}>
            <div className="share-card-modal-header">
              <span className="share-card-modal-title">{shareModal.title}</span>
              <button
                type="button"
                className="share-card-modal-close"
                onClick={() => setShareModal(null)}
                aria-label="Close"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="18"
                  height="18"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="share-format-segmented" aria-label="Share image format">
              <button
                type="button"
                className={shareModal.format === 'post' ? 'active' : ''}
                onClick={() => generateShareCard(shareModal.kind, 'post')}
              >
                Square Post
              </button>
              <button
                type="button"
                className={shareModal.format === 'story' ? 'active' : ''}
                onClick={() => generateShareCard(shareModal.kind, 'story')}
              >
                Vertical Story
              </button>
            </div>
            <div className="share-card-modal-preview">
              {shareModal.dataUrl ? (
                <img src={shareModal.dataUrl} alt="Share card preview" />
              ) : (
                <div className="share-card-modal-loading">
                  {shareModal.status || 'Preparing share image...'}
                </div>
              )}
            </div>
            <div className="share-caption-box">
              <p>{shareModal.shareText}</p>
            </div>
            <div className="share-card-modal-actions">
              {phoneShareDevice ? (
                <button
                  type="button"
                  className="share-card-modal-btn primary"
                  disabled={!shareModal.dataUrl || generatingCard || sharingCard}
                  onClick={shareFromModal}
                >
                  {sharingCard ? 'Opening...' : 'Save / Share Image & Caption'}
                </button>
              ) : (
                <button
                  type="button"
                  className="share-card-modal-btn primary"
                  disabled={!shareModal.dataUrl || generatingCard || sharingCard}
                  onClick={downloadFromModal}
                >
                  Download Image &amp; Copy Caption
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hidden share cards — captured by html-to-image */}
      <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', pointerEvents: 'none' }}>
        <LeaderboardShareCardIndividual
          rows={rankedContributorRows}
          myUsername={myUsername}
          metric={metric}
          period={period}
          todayLabel={todayLabel}
          cardRef={individualStoryRef}
          format="story"
        />
        <LeaderboardShareCardIndividual
          rows={rankedContributorRows}
          myUsername={myUsername}
          metric={metric}
          period={period}
          todayLabel={todayLabel}
          cardRef={individualPostRef}
          format="post"
        />
        <LeaderboardShareCardMunicipality
          rankedMunicipalities={rankedMunicipalities}
          myMunicipality={myMunicipality}
          metric={metric}
          period={period}
          todayLabel={todayLabel}
          cardRef={municipalityStoryRef}
          format="story"
        />
        <LeaderboardShareCardMunicipality
          rankedMunicipalities={rankedMunicipalities}
          myMunicipality={myMunicipality}
          metric={metric}
          period={period}
          todayLabel={todayLabel}
          cardRef={municipalityPostRef}
          format="post"
        />
      </div>
    </section>
  )
}
