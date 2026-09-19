/**
 * Purpose: Resolve a peer's country to a world-atlas feature id so the map can be
 *          painted from tracker data. The tracker returns ISO 3166-1 alpha-2 from
 *          GeoIP ("US"); older peer records carry "City, CC"; both are empty when the
 *          tracker runs with the stub resolver or the peer is on a private IP.
 *          Everything that does not resolve is counted as "unknown", never dropped.
 */

/** ISO 3166-1 alpha-2 -> ISO 3166-1 numeric (the `id` of world-atlas country features). */
export const ALPHA2_TO_NUMERIC: Readonly<Record<string, string>> = {
  AF: '004',
  AX: '248',
  AL: '008',
  DZ: '012',
  AS: '016',
  AD: '020',
  AO: '024',
  AI: '660',
  AQ: '010',
  AG: '028',
  AR: '032',
  AM: '051',
  AW: '533',
  AU: '036',
  AT: '040',
  AZ: '031',
  BS: '044',
  BH: '048',
  BD: '050',
  BB: '052',
  BY: '112',
  BE: '056',
  BZ: '084',
  BJ: '204',
  BM: '060',
  BT: '064',
  BO: '068',
  BQ: '535',
  BA: '070',
  BW: '072',
  BV: '074',
  BR: '076',
  IO: '086',
  BN: '096',
  BG: '100',
  BF: '854',
  BI: '108',
  CV: '132',
  KH: '116',
  CM: '120',
  CA: '124',
  KY: '136',
  CF: '140',
  TD: '148',
  CL: '152',
  CN: '156',
  CX: '162',
  CC: '166',
  CO: '170',
  KM: '174',
  CG: '178',
  CD: '180',
  CK: '184',
  CR: '188',
  CI: '384',
  HR: '191',
  CU: '192',
  CW: '531',
  CY: '196',
  CZ: '203',
  DK: '208',
  DJ: '262',
  DM: '212',
  DO: '214',
  EC: '218',
  EG: '818',
  SV: '222',
  GQ: '226',
  ER: '232',
  EE: '233',
  SZ: '748',
  ET: '231',
  FK: '238',
  FO: '234',
  FJ: '242',
  FI: '246',
  FR: '250',
  GF: '254',
  PF: '258',
  TF: '260',
  GA: '266',
  GM: '270',
  GE: '268',
  DE: '276',
  GH: '288',
  GI: '292',
  GR: '300',
  GL: '304',
  GD: '308',
  GP: '312',
  GU: '316',
  GT: '320',
  GG: '831',
  GN: '324',
  GW: '624',
  GY: '328',
  HT: '332',
  HM: '334',
  VA: '336',
  HN: '340',
  HK: '344',
  HU: '348',
  IS: '352',
  IN: '356',
  ID: '360',
  IR: '364',
  IQ: '368',
  IE: '372',
  IM: '833',
  IL: '376',
  IT: '380',
  JM: '388',
  JP: '392',
  JE: '832',
  JO: '400',
  KZ: '398',
  KE: '404',
  KI: '296',
  KP: '408',
  KR: '410',
  KW: '414',
  KG: '417',
  LA: '418',
  LV: '428',
  LB: '422',
  LS: '426',
  LR: '430',
  LY: '434',
  LI: '438',
  LT: '440',
  LU: '442',
  MO: '446',
  MG: '450',
  MW: '454',
  MY: '458',
  MV: '462',
  ML: '466',
  MT: '470',
  MH: '584',
  MQ: '474',
  MR: '478',
  MU: '480',
  YT: '175',
  MX: '484',
  FM: '583',
  MD: '498',
  MC: '492',
  MN: '496',
  ME: '499',
  MS: '500',
  MA: '504',
  MZ: '508',
  MM: '104',
  NA: '516',
  NR: '520',
  NP: '524',
  NL: '528',
  NC: '540',
  NZ: '554',
  NI: '558',
  NE: '562',
  NG: '566',
  NU: '570',
  NF: '574',
  MK: '807',
  MP: '580',
  NO: '578',
  OM: '512',
  PK: '586',
  PW: '585',
  PS: '275',
  PA: '591',
  PG: '598',
  PY: '600',
  PE: '604',
  PH: '608',
  PN: '612',
  PL: '616',
  PT: '620',
  PR: '630',
  QA: '634',
  RE: '638',
  RO: '642',
  RU: '643',
  RW: '646',
  BL: '652',
  SH: '654',
  KN: '659',
  LC: '662',
  MF: '663',
  PM: '666',
  VC: '670',
  WS: '882',
  SM: '674',
  ST: '678',
  SA: '682',
  SN: '686',
  RS: '688',
  SC: '690',
  SL: '694',
  SG: '702',
  SX: '534',
  SK: '703',
  SI: '705',
  SB: '090',
  SO: '706',
  ZA: '710',
  GS: '239',
  SS: '728',
  ES: '724',
  LK: '144',
  SD: '729',
  SR: '740',
  SJ: '744',
  SE: '752',
  CH: '756',
  SY: '760',
  TW: '158',
  TJ: '762',
  TZ: '834',
  TH: '764',
  TL: '626',
  TG: '768',
  TK: '772',
  TO: '776',
  TT: '780',
  TN: '788',
  TR: '792',
  TM: '795',
  TC: '796',
  TV: '798',
  UG: '800',
  UA: '804',
  AE: '784',
  GB: '826',
  US: '840',
  UM: '581',
  UY: '858',
  UZ: '860',
  VU: '548',
  VE: '862',
  VN: '704',
  VG: '092',
  VI: '850',
  WF: '876',
  EH: '732',
  YE: '887',
  ZM: '894',
  ZW: '716',
};

const NUMERIC_TO_ALPHA2: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(ALPHA2_TO_NUMERIC).map(([a2, num]) => [num, a2]),
);

let displayNames: Intl.DisplayNames | null | undefined;

/** English country name for a world-atlas id ("840" -> "United States"), from the browser's own
 *  region table; the ISO code itself when the engine has no Intl.DisplayNames. */
export function countryName(numericId: string): string {
  const alpha2 = NUMERIC_TO_ALPHA2[numericId];
  if (!alpha2) return 'Unknown';
  if (displayNames === undefined) {
    try {
      displayNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
    } catch {
      displayNames = null;
    }
  }
  try {
    return displayNames?.of(alpha2) ?? alpha2;
  } catch {
    return alpha2;
  }
}

/** Non-ISO spellings that show up in peer records. */
const ALIASES: Readonly<Record<string, string>> = { UK: 'GB', EL: 'GR', USA: 'US' };

/**
 * Country id for a peer, or null when the location is unknown.
 * Accepts "US", "us", "London, UK", "San Francisco, US"; anything else is unknown.
 */
export function resolveCountryId(peer: { country?: string; city?: string }): string | null {
  const raw = (peer.country ?? '').trim();
  if (!raw) return null;
  const tail = raw.includes(',') ? raw.slice(raw.lastIndexOf(',') + 1).trim() : raw;
  const code = tail.toUpperCase();
  const alpha2 = ALIASES[code] ?? code;
  return ALPHA2_TO_NUMERIC[alpha2] ?? null;
}

export interface CountryCounts {
  /** Active peers per world-atlas country id. */
  byCountry: Record<string, number>;
  /** Active peers whose location could not be resolved. */
  unknown: number;
  /** Largest per-country count, floor 10 so a tiny network still gets a readable scale. */
  scaleMax: number;
}

/** Group active (non-offline) peers by resolved country. */
export function countPeersByCountry(peers: ReadonlyArray<{ status: string; country?: string; city?: string }>): CountryCounts {
  const byCountry: Record<string, number> = {};
  let unknown = 0;
  for (const p of peers) {
    if (p.status === 'offline') continue;
    const id = resolveCountryId(p);
    if (id) byCountry[id] = (byCountry[id] ?? 0) + 1;
    else unknown++;
  }
  const max = Object.values(byCountry).reduce((m, n) => Math.max(m, n), 0);
  return { byCountry, unknown, scaleMax: Math.max(10, max) };
}
