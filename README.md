# Flow Visualizer

A simple, dependency-free website for comparing streamlines, pathlines and streaklines.

## Files

- `index.html` — page structure and content
- `css/style.css` — layout, colours and responsive styling
- `js/app.js` — presets, particle integration, drawing and controls

## Run it

1. Keep the folder structure unchanged.
2. Open `index.html` in a modern browser.
3. No installation or build step is required.

## Editing velocity fields

The two expression fields accept `x`, `y`, `t`, and parameters `a`, `b`, `c`, `w`.
For example:

- `u = a`
- `v = b*sin(c*x-w*t)`

Use `^` for powers. The expression evaluator uses JavaScript's `Function` constructor, so only enter expressions you trust. This is a local learning tool, not a secure environment for accepting expressions from other users.
