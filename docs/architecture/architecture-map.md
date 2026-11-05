# معمارية المشروع وشجرة المجلدات

افتح الملف في VS Code ثم استخدم **Markdown: Open Preview** لعرض المخطط.

## شجرة الملفات

```text
my-electron-app/
├── src/                         واجهة React
│   ├── main.jsx                 نقطة دخول الواجهة
│   ├── App.jsx                  التنقل وتجميع الشاشات
│   ├── pages/                   صفحات النظام
│   ├── components/              مكونات الواجهة والنوافذ
│   ├── contexts/                حالة المستخدم والإعدادات
│   ├── hooks/                   منطق واجهة مشترك
│   ├── utils/                   دوال مساعدة
│   ├── styles/                  CSS
│   └── assets/                  الصور والموارد
├── electron/                    التطبيق الخلفي وعمليات Electron
│   ├── main.js                  بدء التطبيق وتسجيل المعالجات
│   ├── preload.js               جسر آمن للواجهة
│   ├── handlers/                معالجات IPC
│   ├── services/                منطق الأعمال والعملاء والخوادم
│   ├── repositories/             استعلامات وتخزين البيانات
│   ├── database/                SQLite وPostgreSQL والمخططات
│   ├── security/                الصلاحيات والبروتوكولات الآمنة
│   └── validators/              التحقق من مدخلات الطلبات
├── shared/                      ملفات مشتركة، مثل permissions.json
├── tests/                       اختبارات الوحدات والتكامل والأمان
│   ├── frontend/ handlers/ services/ validators/
│   ├── integration/ security/ recovery/ performance/
│   ├── smoke/ snapshots/
├── e2e/                         اختبارات Electron من البداية للنهاية
├── scripts/                     سكربتات مساعدة
├── rules/                       قواعد وإعدادات للمشروع
├── public/                      موارد الواجهة العامة
├── build/                       أيقونات وموارد تغليف Electron
├── api-server.js                API محلي لاختبارات Postman
├── central-server.js            خادم مركزي يعتمد PostgreSQL
├── start-cluster.js             تشغيل عقدتي API وموازن الأحمال
├── load-balancer.js             موازن أحمال Node.js
├── nginx.conf                   إعداد بديل لموازن Nginx
├── scripts/test-db.js           فحص قاعدة البيانات
├── scripts/verify-connection.js فحص اتصال قاعدة البيانات
├── vite.config.js               إعداد بناء React
├── package.json                 الأوامر والاعتماديات
└── README.md                    تعليمات التشغيل والتوثيق
```

`dist/` و`coverage/` و`release/` و`node_modules/` مخرجات أو اعتماديات مولدة، وليست مصدرًا أساسيًا. ملف `.env` للإعدادات السرية؛ لا تضع محتواه في المخططات أو المستندات.

## مسارات التشغيل

```mermaid
flowchart LR
  subgraph RENDERER[واجهة جهاز الكاشير - src]
    ENTRY[main.jsx] --> APP[App.jsx]
    APP --> PAGES[pages/]
    APP --> COMPONENTS[components/]
    APP --> CONTEXTS[contexts/]
    PAGES --> HOOKS[hooks/]
    PAGES --> COMPONENTS
    PAGES --> CONTEXTS
    PAGES --> UTILS[utils/]
    PAGES --> API[window.electronAPI]
  end

  subgraph ELECTRON[تطبيق Electron - electron]
    PRELOAD[preload.js<br/>واجهة آمنة]
    MAIN[main.js<br/>بدء التطبيق والتسجيل]
    IPC[handlers/*<br/>IPC والتحقق من الصلاحيات]
    CENTRAL_HANDLER[centralClient.handler.js]
    CENTRAL_CLIENT[centralClient.service.js]
    LOCAL_SERVICES[services/*]
    REPOS[repositories/*]
    SQLITE[database/db.js<br/>SQLite + WAL]
    SQLITE_FILE[(shop.db على جهاز المضيف)]
    LAN_SERVER[services/lanServer.service.js<br/>REST على المنفذ 5000]

    MAIN --> IPC
    MAIN --> SQLITE
    IPC --> LOCAL_SERVICES
    CENTRAL_HANDLER --> CENTRAL_CLIENT
    LAN_SERVER --> LOCAL_SERVICES
    LOCAL_SERVICES --> REPOS --> SQLITE --> SQLITE_FILE
  end

  API --> PRELOAD
  PRELOAD -->|وضع محلي: IPC| IPC
  PRELOAD -->|وضع فرع: HTTP| CENTRAL_HANDLER
  CENTRAL_CLIENT -->|LAN| LAN_SERVER

  subgraph POSTGRES[الخادم المركزي الاختياري - PostgreSQL]
    CLUSTER[start-cluster.js]
    LB[load-balancer.js<br/>المنفذ 8080]
    NODE1[central-server.js<br/>العقدة 5000]
    NODE2[central-server.js<br/>العقدة 5001]
    POOL[electron/database/dbPool.js]
    PG[(PostgreSQL)]
    CLUSTER --> LB
    CLUSTER --> NODE1
    CLUSTER --> NODE2
    LB --> NODE1
    LB --> NODE2
    NODE1 --> POOL
    NODE2 --> POOL
    POOL --> PG
  end

  CENTRAL_CLIENT -->|عنوان الخادم المركزي| LB
  NGINX[nginx.conf<br/>بديل لموازن Node.js] -. يوجّه إلى العقد .-> NODE1
  NGINX -.-> NODE2

  classDef ui fill:#e8f4ff,stroke:#367bb5,color:#17324d;
  classDef bridge fill:#fff2d7,stroke:#ba7c16,color:#49320a;
  classDef backend fill:#e8f5e9,stroke:#388e3c,color:#173b1a;
  classDef database fill:#fce8e6,stroke:#c34b43,color:#4d1d1a;
  class ENTRY,APP,PAGES,COMPONENTS,CONTEXTS,HOOKS,UTILS,API ui;
  class PRELOAD,IPC,CENTRAL_HANDLER,CENTRAL_CLIENT,LAN_SERVER,LB,NGINX bridge;
  class MAIN,LOCAL_SERVICES,REPOS,CLUSTER,NODE1,NODE2,POOL backend;
  class SQLITE,SQLITE_FILE,PG database;
```

## وظيفة كل جزء

- **`src/`**: يعرض الشاشات ويتعامل مع واجهة `window.electronAPI` فقط؛ لا يتصل بقاعدة البيانات.
- **`electron/preload.js`**: يعرّف API محدودًا وآمنًا بين React وعملية Electron. يختار بعض الطلبات محليًا عبر IPC أو يوجهها إلى خادم الفرع.
- **`electron/handlers/`**: يستقبل IPC، يطبق فحوص الصلاحيات عبر `safeHandle.js`، ثم يستدعي خدمات الخلفية.
- **`electron/services/`**: منطق الأعمال، خادم LAN، عميل الخادم المركزي، النسخ الاحتياطي، الطباعة والتحديثات.
- **`electron/repositories/`**: الوصول إلى البيانات. خدمات SQLite تستخدم `electron/database/db.js`؛ الخادم المركزي يستخدم `dbPool.js` مع PostgreSQL.
- **LAN بفروع SQLite**: أجهزة الكاشير تتصل بواجهة المضيف عبر HTTP؛ ملف SQLite يظل محليًا على المضيف ولا يوضع في مجلد مشترك.
- **PostgreSQL المركزي**: `start-cluster.js` يشغل عقدتين من `central-server.js` وموازن `load-balancer.js`. يمكن استخدام `nginx.conf` كإعداد بديل للموازنة.
- **`api-server.js`**: خادم REST مساعد لاختبارات Postman، وليس هو خادم LAN الخاص بتطبيق Electron.
- **الاختبارات**: `tests/` يغطي الوحدات والتكامل والأمان والاستعادة والأداء؛ `e2e/` يختبر التطبيق كاملًا.
- **البناء**: `vite` يبني الواجهة إلى `dist/`، ثم Electron Builder يغلّف التطبيق في `release/`.

## التحقق الفعلي الحالي

### 1) ما تم تأكيده في الكود
- كل فرع/آلة يملك قاعدة بيانات SQLite محلية، ويتم تهيئتها في `electron/database/db.js`.
- وضع WAL مفعّل عبر `db.pragma('journal_mode = WAL')`.
- `db.backup()` هو واجهة النسخ الاحتياطي الصحيحة.
- الاستعادة تستدعي `closeDatabase()` ثم تستبدل الملف من نسخة احتياطية، مع تنظيف ملفات `-wal` و`-shm` بعد الاستعادة.
- خادم LAN في `electron/services/lanServer.service.js` يعمل كنقطة HTTP للطلبات، وليس كقاعدة بيانات مشتركة.
- `api-server.js` يربط على `127.0.0.1` فقط، لذا لا يفتح لواجهة LAN بشكل مباشر.
- `requirePermission()` لا يتجاوز التحقق، بل يستدعي `requireAuth()` أولًا قبل فحص الصلاحيات.

### 2) ما تم إبطاله بعد التحقق
- ليس هناك دليل فعلي على أن WAL لا يدخل في النسخة الاحتياطية.
- ليس هناك دليل فعلي على أن LAN يخترق SQLite محليًا كقاعدة واحدة مشتركة.
- ليس هناك دليل فعلي على وجود bypass في auth داخل الكود الحالي.

### 3) ما تم تقويته فعليًا
- تم تحسين استعادة النسخة الاحتياطية إلى كتابة ملف مؤقت ثم استبدال الملف بشكل ذري، لتجنب الكتابة المباشرة الجزئية إلى قاعدة البيانات الحالية.
- تم إضافة اختبارات صارمة للتحقق من احتواء النسخ الاحتياطي للبيانات الموجودة في WAL.
- تم إضافة اختبارات للتحقق من تنظيف ملفات WAL و SHM أثناء الاستعادة.

### 4) ما الذي سيُدار لاحقًا إن أردنا تعزيز الأمان
- التحقق من سلامة ملف النسخة الاحتياطية قبل الاستعادة
- الاحتفاظ بعدد محدود من النسخ الاحتياطية اليومية والشutdown
- كتابة سجل Restore Audit
- استخدام backup على ملف مؤقت ثم rename بأمان في نفس المجلد
- مراجعة صلاحيات الوصول عبر LAN فقط للفرع/الآلة المسماة

## حدود المخطط

العلاقات داخل `src/` تعتمد على `import`. الأسهم بين preload وIPC وHTTP وقواعد البيانات تشرح تدفق التشغيل؛ هذه العلاقات لا تظهر كلها في أدوات تحليل الاستيراد مثل Madge.