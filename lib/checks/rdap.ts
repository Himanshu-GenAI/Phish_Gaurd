export interface DomainCheck {
  domain: string;
  ageDays: number | null;
  registeredOn: string;
  weight: number;
  note: string;
}

export async function checkDomain(
  url: string
): Promise<DomainCheck | null> {
  try {
    const domain = new URL(url).hostname;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    let res: Response;
    try {
      res = await fetch(`https://rdap.org/domain/${domain}`, {
        signal: ctrl.signal,
        headers: { accept: "application/rdap+json" },
      });
    } finally {
      clearTimeout(t);
    }
    if (!res.ok) return null;

    const data = await res.json();
    const reg = (data.events ?? []).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e: any) => e.eventAction === "registration"
    );
    if (!reg) return null;

    const ageDays = Math.floor(
      (Date.now() - Date.parse(reg.eventDate)) / 86_400_000
    );
    let weight = 0;
    let note = "";

    if (ageDays < 30) {
      weight = 25;
      note = `Domain registered only ${ageDays} day(s) ago`;
    } else if (ageDays < 90) {
      weight = 15;
      note = `Domain registered ${ageDays} days ago — very new`;
    } else if (ageDays < 365) {
      weight = 8;
      note = `Domain registered ${ageDays} days ago`;
    } else {
      weight = 0;
      note = `Domain is ${ageDays} days old — established`;
    }

    return {
      domain,
      ageDays,
      registeredOn: String(reg.eventDate).slice(0, 10),
      weight,
      note,
    };
  } catch {
    // unsupported TLD or timeout → no signal, never crash
    return null;
  }
}
