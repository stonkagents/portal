# Redux Store

- **store/** – Root store, `configureStore`, `rootReducer`.
- **store/slices/** – Feature slices (e.g. `authSlice`, `uiSlice`).
- **store/hooks.ts** – Typed `useAppDispatch`, `useAppSelector`.

Keep global state minimal; prefer local state where possible.
