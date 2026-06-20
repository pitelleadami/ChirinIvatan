import bascoFlag from '../assets/municipality-flags/basco-flag.webp'
import itbayatFlag from '../assets/municipality-flags/itbayat-flag.webp'
import ivanaFlag from '../assets/municipality-flags/ivana-flag.webp'
import mahataoFlag from '../assets/municipality-flags/mahatao-flag.webp'
import sabtangFlag from '../assets/municipality-flags/sabtang-flag.webp'
import uyuganFlag from '../assets/municipality-flags/uyugan-flag.webp'

export const MUNICIPALITY_FLAGS = {
  basco: bascoFlag,
  itbayat: itbayatFlag,
  ivana: ivanaFlag,
  mahatao: mahataoFlag,
  sabtang: sabtangFlag,
  uyugan: uyuganFlag,
}

export function getMunicipalityFlag(municipality) {
  const key = String(municipality || '')
    .trim()
    .toLowerCase()
  return MUNICIPALITY_FLAGS[key] || ''
}
