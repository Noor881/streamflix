# HD Watchzone — Daily Social Automation Setup

## Kya Milega
- ✅ Har roz 2 trending movies auto-post on **Telegram channel**
- ✅ Har roz 2 trending movies auto-post on **Reddit subreddit**
- ✅ Same movie dobara nahi aayegi (dedup system)
- ✅ Pakistan time 2pm pe post hogi (9am UTC)
- ✅ **FREE** — GitHub Actions use karta hai

---

## Step 1: Telegram Bot Banao (5 min)

1. Telegram pe **@BotFather** ko open karo
2. `/newbot` type karo
3. Name: `HD Watchzone Bot`
4. Username: `hdwatchzone_bot`
5. **Token copy karo** (yeh hoga: `1234567890:ABCdef...`)

### Channel Banao
1. New Channel → Name: **HD Watchzone**
2. Username: `@hdwatchzone` (ya jo available ho)
3. Channel ko **Public** rakho
4. Bot ko channel ka **Admin** banao (Admin rights → Post Messages ON)

### Channel ID lena
- Public channel hone pe channel ID hogi: `@hdwatchzone`
- Ya numeric ID lene ke liye: `https://api.telegram.org/bot<TOKEN>/getChat?chat_id=@hdwatchzone`

---

## Step 2: Reddit Setup (10 min)

### Subreddit Banao
1. Reddit.com pe login karo
2. `reddit.com/subreddits/create` pe jao
3. Name: `HDWatchzone`
4. Type: **Public**
5. Description: "Watch free movies & TV shows in HD — no signup needed. New movies posted daily!"
6. Logo + banner lagao (hdwatchzone.com se)

### Reddit App Banao (API Access)
1. `reddit.com/prefs/apps` pe jao
2. **Create App** click karo
3. Name: `HDWatchzone Bot`
4. Type: **script**
5. Redirect URI: `http://localhost:8080`
6. **Create app** click karo
7. **client_id** copy karo (naam ke neeche chhoti si string)
8. **secret** copy karo

---

## Step 3: GitHub Secrets Add Karo

GitHub pe apna repo open karo → **Settings → Secrets and variables → Actions → New repository secret**

Yeh secrets add karo:

| Secret Name | Value |
|------------|-------|
| `TMDB_API_KEY` | `d74b73cd4563f614919e6493152fbc1e` |
| `TELEGRAM_BOT_TOKEN` | Bot token (BotFather se mila) |
| `TELEGRAM_CHANNEL_ID` | `@hdwatchzone` (ya numeric ID) |
| `REDDIT_CLIENT_ID` | Reddit app client_id |
| `REDDIT_CLIENT_SECRET` | Reddit app secret |
| `REDDIT_USERNAME` | Tumhara Reddit username |
| `REDDIT_PASSWORD` | Tumhara Reddit password |
| `REDDIT_SUBREDDIT` | `HDWatchzone` |

---

## Step 4: Push & Test

```bash
git add scripts/daily-poster.js .github/workflows/daily-poster.yml
git commit -m "Add: Daily auto-poster for Telegram + Reddit"
git push
```

### Manual Test karo:
1. GitHub → Actions tab
2. **Daily Movie Poster** workflow dhundho
3. **Run workflow** click karo
4. Logs dekho — movies post ho jaayein gi!

---

## Telegram Post Preview

```
🎬 *Dune: Part Two* (2024)

⭐ *Rating:* 8.5/10
⏱ *Runtime:* 2h 46m
🎥 *Director:* Denis Villeneuve
👥 *Cast:* Timothée Chalamet, Zendaya

📖 Follow the mythic journey of Paul...

#SciFi #Action #Adventure

▶️ *Watch Free:* [Click Here](https://hdwatchzone.com/movie/...)

🌐 @hdwatchzone
```

## Reddit Post Preview

```markdown
## Dune: Part Two (2024)

| Detail | Info |
|--------|------|
| ⭐ Rating | 8.5/10 |
| ⏱ Runtime | 2h 46m |
| 🎬 Genre | Sci-Fi, Adventure |
| 🎥 Director | Denis Villeneuve |

### Explore Dune: Part Two on HD Watchzone

> Title metadata and community scores are supplied by TMDB. External playback availability depends on the provider and region; a catalog listing is not a playback or quality guarantee.
```

---

## Responsible promotion and dry runs

Use the manual workflow's **Dry run** option to preview selected title-information links without social authentication, posting or history writes. A dry run still reads TMDB metadata. The equivalent CLI is `node scripts/daily-poster.js --dry-run`; `DRY_RUN=true` is also supported. Invalid environment values stop execution before network activity.

The existing daily schedule and default live behavior are unchanged. A live run sends messages to configured services; do not trigger it as a test. Before enabling promotion, confirm permission for each destination, check community/platform rules, review accurate source-attributed copy, and verify any applicable media rights. Do not mass-post backlinks, fabricate independent reviews or promise subscriber counts, indexing or ranking gains.
