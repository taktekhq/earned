# earned

A shop where every product has to be **won** before it can be bought.

Each piece gets its own little game (hold still for ten seconds, come back on Saturday,
stop a stopwatch on exactly 1.000 s, or anything you write yourself). Win it and the
Buy button appears. Checkout is Stripe; fulfilment is Printful. The pages are static
HTML you can host anywhere (GitHub Pages, Cloudflare Pages, a folder on your server).

```
store.json ──► node build.mjs SITE ──► SITE/index.html          (the wall of pieces)
                                       SITE/<slug>/index.html   (one page per piece)
                                       SITE/_earned/            (runtime + built-in games)

Buy ──► Worker POST /checkout ──► Stripe Checkout ──► paid
                                                       └─► webhook ──► Printful order
```

## Quick start

```sh
git clone https://github.com/taktekhq/earned && cd earned
cp -r example ../my-shop
node build.mjs ../my-shop
npx serve ../my-shop        # open the printed URL
```

The example has three pieces: one built-in game, one time-window game and one
custom game (`example/games/coin.js`).

## store.json

| Field | What it is |
|---|---|
| `id` | Short id, lowercase (`my-shop`). Used for browser storage and by the Worker. |
| `name`, `headline`, `intro`, `footer` | Words on the page. `intro` and `footer` may contain HTML. |
| `url` | Public URL of the shop, ending in `/`. Used for canonical and social tags. |
| `currency` | ISO code, default `USD`. |
| `checkout` | URL of the Worker's `/checkout`. `null` shows "Checkout opens soon". |
| `printfulStoreId` | Your Printful store id (Printful → Stores, or `GET /stores`). |
| `brand` | Optional look: `paper`, `ink`, `accent`, `muted`, `fontDisplay`, `fontMono`, `fontsHref` (a Google Fonts URL), `logo`, `favicon`. |
| `debug` | `true` lets `?now=2026-10-10T06:00` fake the clock so time games can be tested. Turn it off before launch. |
| `pieces[]` | The products, below. |

Each piece:

| Field | What it is |
|---|---|
| `slug` | URL name (`patience-mug`). |
| `name`, `line`, `description`, `details[]` | Words. `line` is the text printed on the product, shown in mono. |
| `challenge` | One line telling people how to unlock it. Shown on the wall and the page. |
| `game` | A built-in (`@still`, `@window`, `@tomorrow`, `@stop`) or a path to your own module. |
| `gameOptions` | Passed to the game as `kit.options`. |
| `images[]` | `{src, alt}`, first one is the cover. |
| `options[]` | Pickers, e.g. `{ "name": "size", "values": ["S","M","L"] }`. |
| `variants[]` | `{ id, options: { size: "M" }, price }`. `id` is the Printful **sync variant id**; `price` in cents (falls back to the piece's `price`). |

## Built-in games

| Game | Options |
|---|---|
| `@still` | `seconds`, `prompt`, `moved`, `done`: keep completely still. |
| `@window` | `days` (0 = Sunday), `from`, `to` (`"HH:MM"`, may wrap midnight), `closed`, `open`, `button`: only opens at certain local times. |
| `@tomorrow` | `prompt`, `ask`, `wait`, `ready`, `hour`: say you want it, then come back after a night. |
| `@stop` | `target` (ms), `tolerance`, `label`: stop a stopwatch on the exact time. |

## Writing a game

A game is an ES module. Its default export receives a `kit` and calls `kit.win()`:

```js
export default function mount(kit) {
  const btn = kit.el('button', { class: 'g-btn', text: 'Press me 5 times' });
  let n = 0;
  btn.onclick = () => { if (++n === 5) kit.win('Five. It\'s yours.'); kit.status(`${n}/5`); };
  kit.stage.append(btn);
}
```

| `kit.` | Does |
|---|---|
| `stage` | The square element to draw in (SVG with `viewBox="0 0 1000 1000"` scales nicely). |
| `win(message)` | Unlocks the piece (remembered in the browser) and shows Buy. |
| `status(text)` | The small line under the stage. |
| `el(tag, attrs, children)`, `svg(...)` | Make elements. `onclick` etc. in attrs are cleaned up for you. |
| `on`, `after`, `every`, `loop(fn(dt))`, `onActivity(fn)` | Listeners, timers and animation frames that are removed on "start over". |
| `point(event)` | Pointer position inside the stage, 0..1. |
| `memory.get/set/del` | Per-piece browser storage (may be empty in private windows). |
| `now()` | The clock (honours `?now=` in debug mode). |
| `options`, `piece`, `colors`, `reducedMotion` | Context. |

Winning is checked in the browser. Someone determined can skip a game with the dev
tools, and that's fine: the game is the fun, not a lock.

## Checkout Worker

`worker/` is a Cloudflare Worker. It never trusts prices from the browser: it bundles your
`store.json` files into `worker/src/catalog.js` at deploy time.

```sh
node worker/make-catalog.mjs ../my-shop/store.json        # any number of stores
cp worker/wrangler.toml.example worker/wrangler.toml       # set ALLOWED_ORIGINS etc.
cd worker
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put PRINTFUL_TOKEN                     # needs the orders scope
npx wrangler deploy
```

Then set your store's `checkout` to `https://<worker>/checkout`, and add a Stripe webhook
for `checkout.session.completed` pointing at `https://<worker>/stripe/webhook`.

- Orders are created as Printful **drafts** unless `CONFIRM_ORDERS = "true"`, so you can
  check the first ones by hand.
- Each Stripe session becomes one Printful `external_id`; a repeated webhook can't order twice.
- Prices include shipping; the Printful order records `retail_costs` for packing slips.
- `NOTIFY_URL` (optional) gets a Slack-style `{text}` POST for every order and every failure.

## Tests

```sh
npm test
```

## Licence

MIT, © Taktek and Nizar Mahmoud.
