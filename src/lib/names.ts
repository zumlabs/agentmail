interface NamePool {
  readonly first: readonly string[];
  readonly last: readonly string[];
}

/** ASCII-only, lowercase pools so locals stay valid mail addresses. */
const POOLS: readonly NamePool[] = [
  {
    first: ["budi", "siti", "agus", "dewi", "rizky", "putri", "andi", "nur", "bayu", "intan", "fajar", "rina"],
    last: ["santoso", "rahayu", "pratama", "wijaya", "sari", "hidayat", "nugroho", "lestari", "saputra", "anggraini", "maulana", "kusuma"],
  },
  {
    first: ["an", "binh", "chi", "dung", "hoa", "hung", "lan", "linh", "minh", "nam", "thao", "tuan"],
    last: ["nguyen", "tran", "le", "pham", "hoang", "huynh", "phan", "vu", "vo", "dang", "bui", "do"],
  },
  {
    first: ["maria", "jose", "andrea", "mark", "angelica", "carlo", "jasmine", "miguel", "nicole", "paolo", "rica", "rafael"],
    last: ["santos", "reyes", "cruz", "bautista", "garcia", "mendoza", "torres", "flores", "ramos", "aquino", "villanueva", "castillo"],
  },
  {
    first: ["james", "emily", "michael", "sarah", "david", "jessica", "daniel", "ashley", "chris", "olivia", "ethan", "grace"],
    last: ["carter", "brooks", "miller", "bennett", "reed", "hayes", "foster", "morgan", "bailey", "turner", "cooper", "parker"],
  },
  {
    first: ["minjun", "seoyeon", "jihoon", "hayoon", "jiwon", "eunwoo", "somin", "taehyun", "yuna", "doyun", "chaewon", "hyunwoo"],
    last: ["kim", "park", "lee", "choi", "jung", "kang", "cho", "yoon", "jang", "lim", "han", "oh"],
  },
];

function pick<T>(values: readonly T[]): T {
  const [index] = crypto.getRandomValues(new Uint32Array(1));
  return values[(index ?? 0) % values.length]!;
}

/**
 * Human-looking local part, e.g. `budi.santoso`, `minjun.kim47`.
 * Uniqueness is only enforced per domain, so collisions retry with a fresh name.
 */
export function randomHumanLocal(): string {
  const pool = pick(POOLS);
  const first = pick(pool.first);
  const last = pick(pool.last);
  // Two digits roughly a third of the time keeps addresses realistic while
  // cutting collision odds for busy domains.
  const suffix = Math.random() < 0.34 ? String(10 + Math.floor(Math.random() * 90)) : "";
  const separator = Math.random() < 0.85 ? "." : "";
  return `${first}${separator}${last}${suffix}`;
}

export const NAME_LOCALES = ["id", "vn", "ph", "us", "kr"] as const;
