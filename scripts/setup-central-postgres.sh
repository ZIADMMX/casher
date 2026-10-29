#!/usr/bin/env bash
set -euo pipefail

PG_USER="${PGUSER:-postgres}"
PG_DB="${PGDATABASE:-kashiear_pos}"
PG_PASSWORD="${PGPASSWORD:-postgres}"
PG_HOST="${PGHOST:-localhost}"
PG_PORT="${PGPORT:-5432}"

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "========================================="
  echo "❌ هذا السكربت يحتاج صلاحية الجذر (sudo)"
  echo "========================================="
  echo "التشغيل الصحيح:"
  echo "  sudo bash scripts/setup-central-postgres.sh"
  exit 1
fi

install_postgres() {
  if command -v psql >/dev/null 2>&1; then
    echo "✅ PostgreSQL موجود بالفعل"
    return 0
  fi

  echo "📦 تثبيت PostgreSQL..."
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y postgresql postgresql-contrib
  elif command -v yum >/dev/null 2>&1; then
    yum install -y postgresql postgresql-server postgresql-contrib
    postgresql-setup initdb || true
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache postgresql postgresql-contrib
    mkdir -p /run/postgresql
    chown postgres:postgres /run/postgresql
    su postgres -c "initdb -D /var/lib/postgresql/data"
  else
    echo "❌ لا يمكن تحديد مدير حزم مناسب لتثبيت PostgreSQL"
    exit 1
  fi
}

configure_postgresql() {
  if command -v pg_ctlcluster >/dev/null 2>&1; then
    local cluster_version
    cluster_version="$(pg_lsclusters --no-header 2>/dev/null | awk '{print $1}' | head -n 1 || true)"
    if [[ -n "$cluster_version" ]]; then
      local cluster_dir="/etc/postgresql/$(pg_lsclusters --no-header 2>/dev/null | awk '{print $1}' | head -n 1)/main"
      local conf_file="$cluster_dir/postgresql.conf"
      local pg_hba_file="$cluster_dir/pg_hba.conf"

      if [[ -f "$conf_file" ]] && ! grep -q "listen_addresses = 'localhost'" "$conf_file"; then
        echo "listen_addresses = 'localhost'" >> "$conf_file"
      fi

      if [[ -f "$pg_hba_file" ]] && ! grep -q "127.0.0.1/32" "$pg_hba_file"; then
        printf '\n# Allow local TCP connections for Kashiear POS\nhost    all             all             127.0.0.1/32            md5\nhost    all             all             ::1/128                 md5\n' >> "$pg_hba_file"
      fi
    fi
  else
    local pg_conf="/etc/postgresql/postgresql.conf"
    local pg_hba="/etc/postgresql/pg_hba.conf"
    if [[ -f "$pg_conf" ]] && ! grep -q "listen_addresses = 'localhost'" "$pg_conf"; then
      echo "listen_addresses = 'localhost'" >> "$pg_conf"
    fi
    if [[ -f "$pg_hba" ]] && ! grep -q "127.0.0.1/32" "$pg_hba"; then
      printf '\n# Allow local TCP connections for Kashiear POS\nhost    all             all             127.0.0.1/32            md5\n' >> "$pg_hba"
    fi
  fi
}

setup_database() {
  echo "🗄️ إعداد مستخدم PostgreSQL الافتراضي..."
  su postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'\" | grep -q 1 || psql -c \"CREATE USER ${PG_USER} WITH SUPERUSER LOGIN PASSWORD '${PG_PASSWORD}';\""

  echo "🗄️ إنشاء قاعدة البيانات ${PG_DB}..."
  if ! su postgres -c "psql -lqt | cut -d '|' -f 1 | tr -d ' ' | grep -qx '${PG_DB}'"; then
    su postgres -c "createdb -O ${PG_USER} ${PG_DB}"
  fi

  echo "🔐 تحديث كلمة المرور للمستخدم ${PG_USER}..."
  su postgres -c "psql -c \"ALTER USER ${PG_USER} WITH PASSWORD '${PG_PASSWORD}';\""

  echo "✅ تم إعداد المستخدم والقاعدة بنجاح"
}

start_postgres_service() {
  echo "🚀 تشغيل خدمة PostgreSQL..."

  if command -v systemctl >/dev/null 2>&1; then
    systemctl enable postgresql >/dev/null 2>&1 || true
    systemctl restart postgresql || service postgresql restart || pg_ctlcluster --skip-systemctl-redirect $(pg_lsclusters --no-header | awk '{print $1}' | head -n 1) start
  else
    service postgresql start || /etc/init.d/postgresql start || true
  fi

  if command -v pg_isready >/dev/null 2>&1; then
    pg_isready -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" || true
  fi
}

verify_connection() {
  echo "🧪 اختبار اتصال PostgreSQL..."
  export PGPASSWORD="$PG_PASSWORD"
  PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -c "SELECT version();" >/tmp/kashiear_postgres_check.txt 2>/tmp/kashiear_postgres_check.err || {
    echo "❌ فشل اتصال PostgreSQL، راجع إعدادات pg_hba.conf و postgres.conf"
    cat /tmp/kashiear_postgres_check.err || true
    exit 1
  }
  echo "✅ اتصال PostgreSQL نجح"
  cat /tmp/kashiear_postgres_check.txt
}

main() {
  install_postgres
  configure_postgresql
  setup_database
  start_postgres_service
  verify_connection

  echo "============================================="
  echo "✅ PostgreSQL المحلي جاهز للمشروع"
  echo "============================================="
  echo "الإعدادات الحالية:"
  echo "  PGHOST=$PG_HOST"
  echo "  PGPORT=$PG_PORT"
  echo "  PGUSER=$PG_USER"
  echo "  PGPASSWORD=$PG_PASSWORD"
  echo "  PGDATABASE=$PG_DB"
  echo ""
  echo "لاستعمال الخادم المركزي:"
  echo "  node central-server.js"
  echo ""
  echo "إذا أردت تغيير كلمة المرور أو اسم القاعدة، أعد تنفيذ السكربت مع متغيرات البيئة."
  echo "============================================="
}

main "$@"
