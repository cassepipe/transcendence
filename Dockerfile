FROM node:20 AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

RUN apt update && apt install -y zsh && apt clean

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# RUN pnpm run build
RUN pnpm run build

FROM base

COPY --from=prod-deps /app/node_modules /app/node_modules

COPY --from=build /app/contract/dist /app/contract/dist
COPY --from=build /app/backend/dist /app/backend/dist
COPY --from=build /app/frontend/build /app/frontend/build
EXPOSE 3000


CMD [ "pnpm", "start" ]
