# Pyra monorepo (web + api)

Stack:
- Front: React + Vite (TypeScript), Atomic Design-ready skeleton.
- Back: NestJS (TypeScript), global prefix `/api`, CORS enabled for Vite.
- Dev container: docker compose (web + api) with volumes for HMR.

## Structure
- `src/`: Vite front (React) – minimal base to extend.
- `api/`: NestJS backend (Express by default).
- `docker-compose.yml`: `web` and `api` services for dev.
- `Dockerfile.web`: front image (dev, Vite).
- `api/Dockerfile`: back image (dev, Nest).

## Run locally (Docker)
```bash
docker compose up --build
# front: http://localhost:5173
# api:   http://localhost:3000/api and /api/hello
```

## Run locally (without Docker)
Backend:
```bash
cd api
npm run start:dev   # port 3000
```
Frontend:
```bash
npm run dev         # port 5173
```
Vite proxy `/api` points to `http://localhost:3000`.

## Tests
Backend:
```bash
cd api
npm test       # unit
npm run test:e2e
```

## Notes
- CORS enabled for `http://localhost:5173` (and 127.0.0.1:5173) in `api/src/main.ts`.
- Vite proxy `/api` lives in `vite.config.ts`.
- Atomic Design folders created (`atoms/molecules/organisms/templates/pages`) with `.gitkeep` placeholders.
- Current UI theme: light/mint (editable in `src/styles/global.css`).
