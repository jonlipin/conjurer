## 1.4.0 - 2026-10-10

- Window styles: a new Look section, above Options, has a Window style button with three choices, Automatic, Blizzard and Dark. Left-click it for the next style, right-click for the previous one. Automatic is the default and changes nothing unless you have EllesmereUI.
- Dark is a flat dark style built in, needing no other addon. The window and the quick access bar get a dark background with thin edges and a title strip, the section headers become flat bars with a + or -, the profile tabs go flat with the one on view marked, buttons go flat, checkboxes and the announce message become dark boxes, and the icons go square with their glow kept. The progress bars keep their flowing fill on a dark track. The portrait goes, and the Ready button moves into its room.
- The Dark background opacity slider, 0 to 100%, sets how much of the world shows through. It applies as you drag, and it is grayed out unless Dark is chosen.
- EllesmereUI support: with EllesmereUI installed and the style on Automatic, Conjurer takes on its look, window, quick access bar, scroll bar, tabs, buttons and all, and the buttons under the trade window follow EllesmereUI's trade window. It is optional, not a requirement.
- Going from Blizzard to Dark happens at once. Any other switch takes a reload of the interface, so Conjurer asks, with a Reload now button, and until then the Look section says which style is still in use. Closed, the section sums up the style chosen and the one in use.
- `/conjure style` moves to the next style, and `/conjure style auto`, `/conjure style blizzard` and `/conjure style dark` pick one. `/conjure debug` has a "skin" line saying which look is in use, and why.
- The window's close X now works in combat. It went through the game's own panel closing, which the game refuses for an addon while you are fighting; the window now simply hides.
- A minimap button collector, such as EllesmereUI's, keeps Conjurer's minimap button where it put it instead of having it pulled back to the minimap rim.
- American spelling throughout.
