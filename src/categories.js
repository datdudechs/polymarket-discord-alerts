// Map a market's Gamma tags to one of our channel keys. First match wins.
const RULES = [
  ["esports", [/esports/i, /\bdota\b/i, /counter-?strike|cs2|csgo/i, /league of legends/i, /valorant/i, /overwatch/i, /rocket league/i]],
  ["soccer", [/soccer/i, /world cup/i, /\bfifa\b/i, /premier league|la ?liga|bundesliga|serie a|ligue 1|champions league|uefa|\bmls\b/i]],
  ["basketball", [/basketball/i, /\bnba\b/i, /\bwnba\b/i]],
  ["baseball", [/baseball/i, /\bmlb\b/i]],
  ["crypto", [/crypto/i, /bitcoin|\bbtc\b/i, /ethereum|\beth\b/i, /solana|\bsol\b/i, /ripple|\bxrp\b/i, /dogecoin|\bdoge\b/i]],
  ["politics", [/politics/i, /election/i, /president/i, /geopolitic/i, /senate|congress|parliament/i]],
];

export function categorize(tags) {
  const text = (tags || []).join(" | ");
  for (const [cat, patterns] of RULES) {
    if (patterns.some((re) => re.test(text))) return cat;
  }
  return "other";
}
