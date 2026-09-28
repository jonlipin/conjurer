# Conjurer

Mage food and water for WoW Forever. Set how much of each rank you want, click Ready, hold one
key, and the game conjures until every target is met. Then hand out shares by class to your party
or raid straight into the trade window, and eat and drink with one button.

Type `/conjure` (or `/conjurer`), or click the minimap button.

## The window

A Blizzard-style window with the Ready bar at the top and six sections you can fold away:

- **Water** and **Food**: every rank, the level needed to use it, how many you have, and a slider
  for how many you want. Ranks you haven't learned are greyed out. **Fill targets from group**
  sets every target to what your group is still owed plus what you keep for yourself.
- **Shares by class**: how much water and food each class gets, and how much you keep. Options to
  fill the trade window by itself, to give each person the best rank they can use, and to include
  the whole raid or just your group of five.
- **Group**: everyone in your party or raid with their share and whether they're ready, short,
  out of range or already handed out. The Trade button asks them to trade and fills the window.
- **Eat and drink macro**: one action bar button that eats your best conjured food and drinks your
  best conjured water at the same time.
- **Options**: the chime, hold to cast, the minimap button, and the debug report.

## Ready and hold to cast

WoW Forever can repeat a cast while you hold its key (Options > Combat > Press and Hold Casting).
The game only does that for its own action bar buttons, so while Ready is lit Conjurer borrows one
button on an action bar you don't show (Action Bar 8 first), puts the next conjure spell on it,
and points the key you picked at that button's own key binding. Holding the key is then exactly
like holding one of your action bar keys.

- Click **Ready** when you're set. It lights up like a spell alert.
- Hold your key. When a row reaches its target, it chimes and the button moves on to the next row.
  If the game keeps the hold going across the change, one hold does everything.
- When every target is met, Ready switches itself off, the borrowed button is emptied and your key
  goes back to what it normally does.
- Entering combat switches Ready off at once. A secure state driver also takes the key away the
  moment combat starts, even if the addon itself is too late.
- While Ready is lit, Conjurer turns on Press and Hold Casting and Cast on Key Down, and puts both
  back to how you had them afterwards. If the game won't let it, each press conjures once.

The key can be any key, with Shift, Ctrl or Alt, or a side mouse button.

## Trading

When a group member opens a trade with you (or you click Trade on their row), their share goes into
the trade window: the best rank they can use, in whole stacks where possible. A share that isn't
whole stacks is split inside your bags first and then moved in. You still press the game's own
Trade button to finish. What was handed over is counted only once the trade completes.

## The eat and drink macro

Click **Make macro** (or drag the icon to your bar). Conjurer writes a macro called Conjurer Eat
that uses your best conjured food and water by item id, so it works in any client language, and
rewrites it as your bags change, out of combat. Delete it and Conjurer leaves it deleted.

## Commands

- `/conjure` opens the window.
- `/conjure ready` turns Ready on or off.
- `/conjure fill` sets the targets from your group.
- `/conjure reset` puts the window back in the middle of the screen.
- `/conjure debug` prints what Conjurer found on this client.
- `/conjure note <text>` writes a line into the log.

## The log

Conjurer keeps a log of what it does (Ready, the borrowed button, each cast, trades, the macro,
and any error) in its saved variables. The game writes it to disk at every `/reload` and logout, in
`WTF\Account\<account>\SavedVariables\Conjurer.lua`. `node tools/conjurer-log.js` in this
repository prints it, with the latest debug report.

## Development

`node tests/conjurertest.js` runs the offline harness (fengari; `--bare` runs it with every
Blizzard template and atlas missing).

## License

MIT
