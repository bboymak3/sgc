# 📖 Guía de Instalación y Despliegue
## Sistema de Órdenes de Trabajo - Global Pro Automotriz

---

## 📋 ÍNDICE

1. [Requisitos Previos](#requisitos-previos)
2. [Estructura del Proyecto](#estructura-del-proyecto)
3. [Configuración de Cloudflare](#configuración-de-cloudflare)
4. [Creación de la Base de Datos D1](#creación-de-la-base-de-datos-d1)
5. [Despliegue en Cloudflare Pages](#despliegue-en-cloudflare-pages)
6. [Configuración del Logo](#configuración-del-logo)
7. [Uso del Sistema](#uso-del-sistema)
8. [Solución de Problemas](#solución-de-problemas)

---

## 📦 REQUISITOS PREVIOS

### Cuenta de Cloudflare
- Tener una cuenta activa en [Cloudflare](https://dash.cloudflare.com/sign-up)
- Plan gratuito (suficiente para este proyecto)

### Herramientas Opcionales
- Git (para clonar/desplegar el proyecto)
- Node.js y npm (para desarrollo local)
- Wrangler CLI (opcional, para desarrollo local)

---

## 📁 ESTRUCTURA DEL PROYECTO

```
taller-cloudflare/
├── logo-ot/                              # Carpeta para el logo
│   ├── logo.png                         # Tu logo va aquí
│   └── .gitkeep                         # Archivo mantenedor
├── functions/                           # Cloudflare Pages Functions
│   ├── api/                             # Endpoints de la API
│   │   ├── crear-orden.js               # Crear nueva orden
│   │   ├── buscar-patente.js            # Buscar vehículo
│   │   ├── buscar-ordenes.js            # Buscar órdenes
│   │   ├── ver-orden.js                 # Ver detalle de orden
│   │   ├── proximo-numero-orden.js      # Obtener próximo número
│   │   ├── aprobar-orden.js             # Aprobar orden con firma
│   │   └── cancelar-orden.js            # Cancelar orden
│   └── aprobar/                         # Página de aprobación
│       ├── index.js                     # Lógica de aprobación
│       └── _middleware.js               # Middleware
├── docs/                                # Documentación
│   └── INSTALACION.md                   # Esta guía
├── index.html                           # Panel administrativo
├── app.js                               # Lógica del panel
├── schema.sql                           # Esquema de base de datos
└── package.json                         # Dependencias
```

---

## ☁️ CONFIGURACIÓN DE CLOUDFLARE

### Paso 1: Iniciar Sesión
1. Ve a [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Inicia sesión con tu cuenta

### Paso 2: Crear un Proyecto de Pages
1. En el menú lateral, haz clic en **Workers & Pages**
2. Haz clic en **Create application**
3. Selecciona **Pages** y haz clic en **Connect to Git**

### Paso 3: Conectar Repositorio
**Opción A: Usar GitHub (Recomendado)**
1. Conecta tu cuenta de GitHub
2. Selecciona o crea un repositorio
3. Sube todos los archivos del proyecto al repositorio
4. Configura los ajustes de build:
   - **Framework preset**: None
   - **Build command**: (dejar vacío)
   - **Build output directory**: `/` (raíz)

**Opción B: Direct Upload**
1. Selecciona **Upload assets**
2. Arrastra todos los archivos del proyecto
3. Haz clic en **Deploy site**

---

## 🗄️ CREACIÓN DE LA BASE DE DATOS D1

### Paso 1: Crear la Base de Datos D1
1. En el Dashboard de Cloudflare, ve a **Workers & Pages**
2. Selecciona tu proyecto de Pages
3. En la pestaña **Settings**, busca **D1 databases**
4. Haz clic en **Create database**
5. Asigna un nombre, por ejemplo: `globalpro-db`
6. Haz clic en **Create**

### Paso 2: Ejecutar el Schema SQL
1. En la página de tu base de datos D1, haz clic en la pestaña **Console**
2. Copia todo el contenido del archivo `schema.sql`
3. Pégalo en el editor de SQL
4. Haz clic en **Execute**

**Contenido de schema.sql:**
```sql
-- El archivo crea las siguientes tablas:
-- - Configuracion (para número de orden secuencial)
-- - Clientes (información de clientes)
-- - Vehiculos (información de vehículos)
-- - OrdenesTrabajo (órdenes de trabajo con todos los datos)
```

### Paso 3: Vincular la Base de Datos al Proyecto
1. En tu proyecto de Pages, ve a **Settings** > **Functions**
2. En la sección **D1 database bindings**, haz clic en **Add binding**
3. Configura:
   - **Variable name**: `DB`
   - **D1 database**: Selecciona la base de datos que creaste
4. Haz clic en **Save**

---

## 🚀 DESPLIEGUE EN CLOUDFLAGES PAGES

### Paso 1: Configurar Variables de Entorno (Opcional)
Si necesitas configurar variables adicionales:
1. Ve a **Settings** > **Environment variables**
2. Agrega las variables necesarias
3. Para este proyecto, no se requieren variables obligatorias

### Paso 2: Desplegar
**Si usas Git:**
1. Haz push de tus cambios al repositorio
2. Cloudflare Pages hará deploy automático
3. Espera a que el deploy termine

**Si usaste Direct Upload:**
1. Ya debería estar deployado
2. Haz cambios y re-sube los archivos cuando sea necesario

### Paso 3: Verificar el Despliegue
1. Ve a la pestaña **Deployment**
2. Espera a que el estado sea **Success**
3. Haz clic en el enlace de tu sitio para verificar

---

## 🖼️ CONFIGURACIÓN DEL LOGO

### Paso 1: Preparar tu Logo
- Formato: PNG (preferible) o JPG
- Tamaño recomendado: 500x500px o 800x300px (horizontal)
- Fondo transparente (se ve mejor en PDF)
- Nombre del archivo: `logo.png`

### Paso 2: Colocar el Logo
1. Abre la carpeta `logo-ot/` del proyecto
2. Coloca tu archivo `logo.png` allí
3. Si ya existe un archivo, reemplázalo

### Paso 3: Verificar
1. Despliega los cambios
2. El sistema leerá automáticamente `logo-ot/logo.png`
3. El logo aparecerá en el PDF generado

**Nota:** Si no tienes un logo, el sistema funcionará sin problemas. Puedes agregarlo después.

---

## 📱 USO DEL SISTEMA

### Para el Técnico (Panel Administrativo)

#### 1. Crear Nueva Orden
1. Accede a la URL de tu sitio
2. El campo de **PATENTE/PLACA** es lo primero que verás (grande y claro)
3. Ingresa la patente y haz clic en **Buscar Vehículo**
4. Si el vehículo existe, los datos se autocompletarán
5. Completa todos los campos del formulario:
   - **Datos del Vehículo**: Marca, modelo, año, cilindrada, etc.
   - **Datos del Cliente**: Nombre, RUT, teléfono
   - **Trabajos a Realizar**: Selecciona los checkboxes y agrega detalles
   - **Checklist del Vehículo**: Nivel de combustible, estado de carrocería
   - **Montos y Pagos**: Total, abono (si aplica), método de pago
6. Haz clic en **GUARDAR ORDEN**
7. Copia el link generado y envíalo al cliente por WhatsApp

#### 2. Buscar Órdenes
1. Haz clic en **Buscar Órdenes** en el menú
2. Ingresa la patente del vehículo
3. Haz clic en **BUSCAR**
4. Filtra por estado:
   - 🟠 En Firma (Enviada)
   - 🟢 Aprobadas
   - 🔴 Canceladas
5. Haz clic en una orden para ver detalles
6. Desde los detalles puedes:
   - Descargar PDF
   - Compartir link
   - Ver la firma del cliente

### Para el Cliente (Aprobación)

#### 1. Recibir y Abrir el Link
1. El cliente recibe un link de WhatsApp
2. Al abrirlo, ve un mensaje personalizado con:
   - Su nombre
   - Número de orden
   - Fecha y hora
   - Nombre del técnico
   - Valor total, abono y restante
   - Resumen de trabajos seleccionados
   - Datos del vehículo
   - Checklist del vehículo

#### 2. Firmar y Aprobar
1. El cliente firma en el canvas (con el dedo en móvil)
2. Puede borrar y volver a firmar si es necesario
3. Tiene dos opciones:
   - **✅ Aceptar y Firmar**: Aprueba la orden
   - **❌ Cancelar**: Cancela la orden (puede indicar motivo)

#### 3. Después de Aprobar
1. Ve una pantalla de confirmación
2. Puede descargar el PDF
3. Puede enviar confirmación por WhatsApp al taller
4. Es redirigido automáticamente al sitio del taller

---

## 🔧 SOLUCIÓN DE PROBLEMAS

### Problema: La base de datos no funciona
**Solución:**
1. Verifica que la base de datos D1 esté creada
2. Verifica que el schema.sql se ejecutó correctamente
3. Verifica que el binding `DB` esté configurado en el proyecto

### Problema: El canvas de firma no funciona en móvil
**Solución:**
1. Verifica que el navegador soporte touch events
2. Prueba en otro navegador (Chrome, Safari)
3. Asegúrate de no tener zoom activado al firmar

### Problema: El PDF no muestra el logo
**Solución:**
1. Verifica que el archivo `logo-ot/logo.png` existe
2. Verifica que el nombre sea exactamente `logo.png` (minúsculas)
3. Asegúrate de que el formato sea PNG o JPG válido
4. Redespliega el proyecto

### Problema: El número de orden no es secuencial
**Solución:**
1. Verifica que la tabla `Configuracion` exista
2. Verifica que tenga un registro con `id = 1`
3. Ejecuta: `SELECT * FROM Configuracion;`
4. Si no existe, inserta: `INSERT INTO Configuracion (id, ultimo_numero_orden) VALUES (1, 57);`

### Problema: No se pueden buscar órdenes
**Solución:**
1. Verifica que las órdenes estén creadas en la base de datos
2. Ejecuta: `SELECT * FROM OrdenesTrabajo;`
3. Verifica que la patente esté correcta (mayúsculas/minusculas)
4. El sistema normaliza a mayúsculas automáticamente

### Problema: Error al aprobar orden
**Solución:**
1. Verifica que el estado sea "Enviada"
2. Si ya fue aprobada o cancelada, no se puede modificar
3. Verifica que la firma se haya capturado correctamente

### Problema: Los colores de estado no se muestran
**Solución:**
1. Verifica que el archivo `app.js` esté cargado
2. Verifica que las clases CSS estén definidas en `index.html`
3. Limpia el caché del navegador

---

## 📊 ESTRUCTURA DE LA BASE DE DATOS

### Tabla: Configuracion
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | ID único (siempre 1) |
| ultimo_numero_orden | INTEGER | Último número de orden usado |
| nombre_empresa | TEXT | Nombre de la empresa |
| direccion | TEXT | Dirección del taller |
| telefono1 | TEXT | Teléfono principal |
| telefono2 | TEXT | Teléfono secundario |
| red_social | TEXT | Red social |

### Tabla: Clientes
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | ID único (autoincremental) |
| nombre | TEXT | Nombre del cliente |
| rut | TEXT | RUT del cliente |
| telefono | TEXT | Teléfono del cliente |
| fecha_registro | DATETIME | Fecha de registro |

### Tabla: Vehiculos
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | INTEGER | ID único (autoincremental) |
| cliente_id | INTEGER | ID del cliente (FK) |
| patente_placa | TEXT | Patente/Placa (única) |
| marca | TEXT | Marca del vehículo |
| modelo | TEXT | Modelo del vehículo |
| anio | INTEGER | Año del vehículo |
| cilindrada | TEXT | Cilindrada |
| combustible | TEXT | Tipo de combustible |
| kilometraje | INTEGER | Kilometraje |

### Tabla: OrdenesTrabajo
Contiene todos los campos de la orden de trabajo, incluyendo:
- Información general (fecha, recepcionista)
- Datos del vehículo
- Trabajos a realizar (5 categorías)
- Checklist del vehículo
- Montos y pagos
- Estado (Enviada, Aprobada, Cancelada)
- Firma del cliente
- Timestamps

---

## 🔒 SEGURIDAD

### Consideraciones Importantes
- Este panel no tiene autenticación (según lo solicitado)
- Cualquiera con la URL puede acceder
- **Recomendación:** Agrega protección básica si el sitio es público

### Cómo Agregar Protección Básica (Opcional)
1. Usa Cloudflare Access
2. O agrega un middleware de autenticación simple
3. O usa protección por IP

---

## 📝 NOTAS FINALES

### Soporte
Para problemas o preguntas:
- Revisa esta documentación
- Verifica los logs de Cloudflare
- Consulta la documentación de Cloudflare Pages y D1

### Actualizaciones
Para actualizar el sistema:
1. Modifica los archivos necesarios
2. Haz push al repositorio o re-sube los archivos
3. Cloudflare hará deploy automático

### Backup de la Base de Datos
Cloudflare D1 no tiene backups automáticos. Para hacer backup:
1. Ve a tu base de datos D1
2. Usa la consola para exportar datos
3. O crea un endpoint `/api/backup` para exportar JSON

---

## ✅ LISTA DE VERIFICACIÓN ANTES DE USAR

- [ ] Cuenta de Cloudflare creada
- [ ] Proyecto de Pages creado
- [ ] Base de datos D1 creada
- [ ] Schema SQL ejecutado
- [ ] Binding `DB` configurado
- [ ] Proyecto deployado
- [ ] Logo (opcional) colocado en `logo-ot/logo.png`
- [ ] Funcionalidad probada:
  - [ ] Crear orden
  - [ ] Buscar vehículo
  - [ ] Buscar órdenes
  - [ ] Cliente puede firmar
  - [ ] PDF se genera correctamente
  - [ ] Estados se muestran con colores correctos

---

**¡Sistema listo para usar! 🚀**

Para más información, visita: [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
