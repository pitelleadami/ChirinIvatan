import bascoFlag from '../assets/municipality-flags/basco-flag.png'
import itbayatFlag from '../assets/municipality-flags/itbayat-flag.png'
import ivanaFlag from '../assets/municipality-flags/ivana-flag.png'
import mahataoFlag from '../assets/municipality-flags/mahatao-flag.png'
import sabtangFlag from '../assets/municipality-flags/sabtang-flag.png'
import uyuganFlag from '../assets/municipality-flags/uyugan-flag.png'

export const MUNICIPALITY_FLAGS = {
  basco: bascoFlag,
  itbayat: itbayatFlag,
  ivana: ivanaFlag,
  mahatao: mahataoFlag,
  sabtang: sabtangFlag,
  uyugan: uyuganFlag,
}

export function getMunicipalityFlag(municipality) {
  const key = String(municipality || '').trim().toLowerCase()
  return MUNICIPALITY_FLAGS[key] || ''
}
