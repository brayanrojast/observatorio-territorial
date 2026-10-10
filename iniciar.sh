#!/bin/bash

echo "==================================================="
echo "    INICIANDO OBSERVATORIO TERRITORIAL (macOS)     "
echo "==================================================="

ROOT_DIR="$(pwd)"
PG_DATA="/usr/local/var/postgresql@16"
[ -d "/opt/homebrew/var/postgresql@16" ] && PG_DATA="/opt/homebrew/var/postgresql@16"

# 1. Configurar variables de entorno requeridas por PostgreSQL en macOS
export LC_ALL="en_US.UTF-8"
export LANG="en_US.UTF-8"

# 2. Limpiar archivos de bloqueo residuales
rm -f "$PG_DATA/postmaster.pid"

# 3. Comprobar si PostgreSQL ya responde en el puerto 5432; si no, levantarlo
if ! nc -z 127.0.0.1 5432 2>/dev/null; then
  echo "🐘 Iniciando PostgreSQL en segundo plano..."
  postgres -D "$PG_DATA" > "$ROOT_DIR/postgres.log" 2>&1 &
  
  # Esperar hasta que el puerto 5432 esté activo
  REINTENTOS=0
  until nc -z 127.0.0.1 5432 || [ $REINTENTOS -ge 15 ]; do
    sleep 1
    REINTENTOS=$((REINTENTOS+1))
  done

  if ! nc -z 127.0.0.1 5432; then
    echo "❌ Error: PostgreSQL no pudo iniciar. Revisa postgres.log"
    exit 1
  fi
  echo "✔ PostgreSQL iniciado correctamente en el puerto 5432."
else
  echo "✔ PostgreSQL ya se encuentra activo."
fi

# 4. Lanzar el Backend en una pestaña independiente de Terminal
osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT_DIR/backend' && npm run dev\""

# 5. Lanzar el Frontend en otra pestaña independiente de Terminal
osascript -e "tell application \"Terminal\" to do script \"cd '$ROOT_DIR/frontend' && npm run dev\""

echo "==================================================="
echo "🚀 ¡Todo el stack ha sido levantado exitosamente!"
echo "   Backend:  http://localhost:4000"
echo "   Frontend: http://localhost:5173"
echo "==================================================="