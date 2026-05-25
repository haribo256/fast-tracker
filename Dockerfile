FROM denoland/deno:latest

WORKDIR /app

COPY deno.json deno.lock* ./
COPY src ./src

ENV DENO_INSTALL=/deno
RUN /deno/bin/deno cache src/main.ts

EXPOSE 8000

CMD ["deno", "run", "--allow-net", "--allow-env", "src/main.ts"]
