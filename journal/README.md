# Bullet

Digital bullet journal enligt Ryder Carrolls metod, med egen nyckel, veckologg, månadsuppslag,
framtidslogg, kvällsgenomgång, rutiner för hemmet, träning, trackers, födelsedagar och samlingar.

Statisk PWA (ingen byggprocess). Data sparas i webbläsaren och synkas mellan enheter via
Cloudflare Workern i `../cloudflare-worker` (KV-nyckeln `journal:state`).

## Kom igång

1. **Synknyckel och notiser (Workern)**
   ```sh
   cd cloudflare-worker
   npx wrangler secret put JOURNAL_KEY   # hitta på en lång lösenfras
   npm run deploy
   ```
   Skriv samma fras under Index → Inställningar → Synknyckel, på mobil och dator.
   Tryck sedan "Slå på på den här enheten" för notiser (06:30 morgon, 20:30 kväll).
   På iPhone måste appen först läggas till på hemskärmen (Dela → Lägg till på hemskärmen).

2. **Google Kalender (bara läsning)**
   * console.cloud.google.com → nytt projekt → aktivera *Google Calendar API*.
   * OAuth consent screen: External, läge Testing, lägg till dig själv som testanvändare.
   * Credentials → OAuth client ID → Web application. Under *Authorized JavaScript origins*
     anger du adressen appen körs på, t.ex. `https://<användare>.github.io`.
   * Klistra in klient ID:t i Inställningar och tryck "Koppla och hämta".
   Appen begär bara `calendar.readonly`. Händelser hämtas 2 veckor bakåt och 4 månader framåt.

## Snabbskrivning

| Först på raden | Betyder |
|---|---|
| `o` | event |
| `m` | möte |
| `.` `-` `~` | notering |
| `!` `*` `?` | deadline, viktigt, kolla upp |
| `14:00` | tid |

I kvällsgenomgången kan raden också börja med när: `imorgon`, `fre`, `12/10`, `2026-10-12`,
`v 42` eller `nov`. Utan datum hamnar den på imorgon.
