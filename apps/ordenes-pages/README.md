# SGC - Sistema de Gestion de Taller

Sistema integral de gestion de ordenes de trabajo para talleres mecanicos con gestion de tecnicos, facturacion, notificaciones WhatsApp, GPS, firma digital, generacion de PDF, cierre masivo de ordenes, liquidacion por tecnico y mas.

Desarrollado para [SGC](https://sgc-ordenes.pages.dev/) y desplegado en Cloudflare Pages.

---

## Tabla de Contenidos

- [Descripcion General](#-descripcion-general)
- [Tecnologias](#-tecnologias)
- [Arquitectura del Sistema](#-arquitectura-del-sistema)
- [Modulos y Funcionalidades](#-modulos-y-funcionalidades)
  - [Panel Administrativo](#1-panel-administrativo)
  - [App del Tecnico (PWA)](#2-app-del-tecnico-pwa)
  - [App del Cliente](#3-app-del-cliente)
  - [Sistema de Notificaciones WhatsApp](#4-sistema-de-notificaciones-whatsapp)
  - [Generacion de PDF](#5-generacion-de-pdf)
  - [Sistema de Domicilios](#6-sistema-de-domicilios)
- [Flujo de Trabajo](#-flujo-de-trabajo)
- [Base de Datos](#-base-de-datos)
- [API Endpoints - Referencia Completa](#-api-endpoints---referencia-completa)
  - [Endpoints Publicos (Cliente)](#endpoints-publicos-cliente)
  - [Endpoints Admin](#endpoints-admin)
  - [Endpoints Tecnico](#endpoints-tecnico)
  - [Endpoints de Paginas](#endpoints-de-paginas)
  - [Librerias Internas](#librerias-internas)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Instalacion](#-instalacion)
- [Licencia](#-licencia)

---

## Descripcion General

SGC es una plataforma web completa que digitaliza y automatiza la operacion de un taller mecanico. El sistema permite crear ordenes de trabajo, asignarlas a tecnicos, rastrear el progreso en tiempo real via GPS, gestionar cobros y comisiones, enviar notificaciones automaticas por WhatsApp, capturar firmas digitales de los clientes y generar documentos PDF profesionales.

La plataforma consta de tres interfaces: un panel administrativo web para el recepcionista/administrador, una app movil progresiva (PWA) para los tecnicos en terreno, y paginas web publicas donde los clientes pueden aprobar y firmar sus ordenes desde cualquier dispositivo.

---

## Tecnologias

| Componente | Tecnologia |
|---|---|
| **Frontend Admin** | JavaScript Vanilla + HTML5 + Bootstrap 5 + Tailwind CSS |
| **Frontend Tecnico** | JavaScript Vanilla + HTML5 + Bootstrap 5 + PWA (Service Worker) |
| **Backend / API** | Cloudflare Pages Functions (serverless) |
| **Base de Datos** | Cloudflare D1 (SQLite serverless) |
| **Almacenamiento** | Cloudflare R2 (fotos de trabajo, imagenes) |
| **Generacion de PDF** | jsPDF 2.5.1 (client-side) |
| **Notificaciones** | UltraMsg API (WhatsApp) |
| **Calculo de Distancia** | OSRM API (rutas reales) + Haversine (fallback) |
| **GPS / Mapas** | Geolocation API + Google Maps (navegacion) |
| **Firma Digital** | Canvas API (touch + mouse) |
| **Despliegue** | Cloudflare Pages (edge computing) |

---

## Arquitectura del Sistema

```
                    +-------------------+
                    |   Cliente Web    |
                    |  /aprobar?token  |
                    |  /ver-ot?token   |
                    +--------+----------+
                             |
                    +--------v----------+        +------------------+
                    | Cloudflare Pages  |<------>|  Cloudflare D1   |
                    |  (Functions)      |        |  (SQLite)        |
                    +---+-----+-----+---+        +--------+---------+
                        |     |     |                     |
            +-----------+     |     +-----------+         |
            |                 |                 |         |
   +--------v------+  +------v--------+  +------v---+  +v-----------+
   | Panel Admin   |  | App Tecnico   |  | WhatsApp |  | Cloudflare  |
   | (app.js)      |  | PWA (tecnico/) |  | (UltraMsg)|  | R2 (fotos)  |
   +---------------+  +---------------+  +----------+  +------------+
```

El sistema es completamente serverless: el frontend se sirve desde Cloudflare Pages, las funciones API se ejecutan como Cloudflare Workers en el edge, la base de datos es SQLite en D1, y las fotos se almacenan en R2. No requiere servidores dedicados ni configuracion de infraestructura compleja.

---

## Modulos y Funcionalidades

### 1. Panel Administrativo

Interfaz web principal para la gestion completa del taller.

#### Creacion de Ordenes de Trabajo
- **Busqueda inteligente por patente**: al ingresar la placa del vehiculo, el sistema auto-completa datos del vehiculo y cliente si ya existen en la base
- **Seleccion de servicios desde catalogo**: checkboxes dinamicos con 25+ servicios pre-cargados (frenos, luces, motor, culatas, embragues, aire acondicionado, scanner, etc.) con precios editables
- **Tecnico obligatorio por servicio**: cada servicio seleccionado DEBE tener un tecnico asignado; el sistema impide guardar sin tecnico
- **Diagnostico flexible**: sistema de checks con observaciones detalladas por cada trabajo
- **Checklist del vehiculo**: registro del nivel de combustible y estado de carroceria (paragolpes, puertas, etc.)
- **Gestion de abonos**: calculo automatico del saldo pendiente al registrar abonos
- **Metodos de pago**: efectivo, transferencia, tarjeta, cheque

#### Edicion de Ordenes de Trabajo
- **Edicion completa**: modificar todos los campos de la orden despues de creada
- **Agregar diagnostico/trabajo desde catalogo**: boton "Agregar Diagnostico / Trabajo" que abre un sub-modal con el catalogo completo de servicios (checks con busqueda, filtro y seleccion masiva)
  - Cada servicio nuevo requiere un tecnico asignado (obligatorio, sin opcion "Sin asignar")
  - Precios editables y campo de descripcion por servicio
  - Deteccion automatica de servicios ya existentes en la orden (se muestran deshabilitados)
  - Resumen en vivo: base comisionable MO y total general
  - Se concatena con los servicios existentes sin sobreescribir
- **Tabla de servicios con acciones**: cambiar tecnico, precio, descripcion, eliminar servicios individuales
- **Edicion manual JSON**: para ajustes avanzados
- **Auto-calculo de total**: servicios + costos adicionales (toggle auto/manual)
- **Mantiene integridad**: no resetea tecnico, patente ni datos al guardar

#### Cierre y Apertura Rapida de Ordenes
- **Candado rojo (Cerrar Orden)**: boton individual por cada orden en todas las vistas
  - Cambia: estado = Aprobada, trabajo = Cerrada, abono = total, restante = $0, pagado = 1, metodo = Efectivo
  - **NO resetea** tecnico, patente, marca, modelo ni servicios
  - Confirmacion con detalle de lo que se va a cambiar
  - Funciona en: Ver Todas las Ordenes, Ordenes Express, Busqueda por patente
- **Candado verde (Abrir Orden)**: boton individual para reabrir ordenes cerradas
  - Cambia: estado = Aprobada, trabajo = Pendiente Visita
  - Permite volver a trabajar en una orden ya cerrada
- **Checkbox de cierre rapido**: seleccion individual con cierre automatico
- **Cerrar TODAS las ordenes**: boton con doble confirmacion para cierre masivo
- **Arreglar Saldos**: boton para forzar saldos de TODAS las ordenes cerradas a $0 restante y abono = total

#### OT EXPRESS (Ordenes Rapidas)
- Creacion urgente de ordenes que omiten el paso de aprobacion del cliente
- Ideales para situaciones de emergencia que requieren atencion inmediata
- La orden se crea directamente en estado "Aprobada" y queda lista para asignar a un tecnico
- Envio de notificacion WhatsApp especifica de orden express (sin link de aprobacion)
- Dashboard dedicado con vista tipo cards y botones de cierre/apertura

#### Dashboard y Reportes
- **Filtros por periodo**: dia, semana, quincena, mes, anio
- **KPIs principales**: total de ordenes, aprobadas, canceladas, cerradas, en proceso, pendientes
- **Resumen financiero**: total generado, abonos recibidos, monto pendiente
- **Estadisticas de trabajo**: servicios mas solicitados (frenos, luces, tren delantero, correas, componentes)
- **Rendimiento por tecnico**: ordenes asignadas, facturado, cerradas
- **Distribucion por metodo de pago**
- **Gastos por categoria**
- **Calculo de comisiones**: (Base + Mano de Obra) x porcentaje de comision
- **Balance neto**: ingresos - gastos - comisiones de tecnicos
- **Exportar a Google Sheets**: integracion directa con Sheets API

#### Gestion de Tecnicos
- **CRUD completo**: crear, editar, desactivar y eliminar tecnicos
- **Datos**: nombre, apellido, telefono, email, PIN de acceso
- **Comision individual**: cada tecnico tiene su propio porcentaje de comision (por defecto 40%)
- **Asignacion de ordenes**: seleccion de ordenes aprobadas sin asignar y asignacion a tecnico
- **Asignacion por item**: cada servicio dentro de una orden puede asignarse a un tecnico diferente
- **Validacion**: prevencion de telefonos duplicados

#### Liquidacion de Tecnicos
- **Calculo automatizado por item**: `Pago = (Mano de Obra de servicios del tecnico + Costos MO proporcionales) x Comision %`
- **Filtro por tecnico_id**: si un servicio tiene `tecnico_id`, solo suma para ese tecnico; si no tiene, se asigna al `tecnico_asignado_id` (fallback para ordenes antiguas)
- **Solo MO genera comision**: los repuestos NO generan comision para el tecnico
- **Desglose por orden**: base, costos MO vs repuestos, base comisionable, ganancia del tecnico
- **Distribucion proporcional**: costos adicionales MO se distribuyen proporcionalmente entre tecnicos
- **Multi-tecnico**: una orden puede tener servicios de varios tecnicos; cada uno ve solo sus items
- **Filtros por periodo**: dia, semana, quincena, mes, anio
- **Exclusion de ordenes liquidadas**: evita doble conteo con el panel "Liquidar Ordenes"
- **Desglose Express vs Normal**: cantidad, total y comisiones por tipo de orden

#### Liquidacion de Ordenes
- **Liquidacion manual**: asignar porcentajes de comision por orden a multiples tecnicos
- **Domicilio por tecnico**: distribucion del cargo de domicilio entre tecnicos
- **Historial de liquidaciones**: ver y eliminar liquidaciones previas
- **Filtros**: pendientes, liquidadas, por periodo

#### Flujo de Caja
- **Vista completa de entradas y salidas**: abonos, comisiones, gastos, liquidaciones
- **Comisiones por tecnico**: card con base comisionable, comision, porcentaje, y desglose por orden (#OT, modelo, marca, base comision, comision)
- **Ordenes Express vs Normal**: desglose de cantidad, total y comisiones por tipo
- **Liquidacion de ordenes**: resumen de comisiones y domicilios liquidados
- **Tareas mas comunes**: top 10 servicios mas realizados
- **Balance neto**: `Abonos - Comisiones - Gastos - Liq.Ordenes(Comision+Domicilio)`
- **Grafico de barras CSS**: comparacion visual ingresos vs salidas
- **Formula visible**: desglose del calculo del balance neto

#### Gastos del Negocio
- **7 categorias**: Repuestos, Herramientas, Servicios, Alquiler, Combustible, Nomina, Otros
- **Registro con fecha**: concepto, monto, categoria, observaciones
- **Filtros por rango de fechas**
- **Resumen por categoria**

#### Costos Adicionales por Orden
- **Dos categorias**: "Mano de Obra" y "Repuestos/Materiales"
- Registro individual por orden con concepto, monto y categoria
- **Desglose en tiempo real** por tipo de costo
- Se pueden agregar a ordenes cerradas (requisito de negocio)
- **Auto-update monto_total**: al agregar costos, el total de la orden se recalcula automaticamente

#### Catalogo de Servicios
- **25+ servicios pre-cargados**: frenos, luces, motores, culatas, embragues, aire acondicionado, scanner, suspension, direccion, electricidad, transmision, escape, refrigeracion, turbo, inyeccion, timing, diferencial, clutch, alternador, motor de arranque, limpieza de inyectores, sincronizacion, alineacion, balanceo, revision general, diagnostico computacional
- **4 categorias**: Mantenimiento, Diagnostico, Reparacion, Otros
- **Tipo de comision**: mano de obra o repuestos (afecta calculo de liquidacion)
- **CRUD**: agregar, editar, desactivar (soft delete), buscar
- **Precios sugeridos editables** al momento de crear una orden

#### Modelos de Vehiculos
- **20+ marcas pre-cargadas**: Toyota, Nissan, Honda, Hyundai, Kia, Chevrolet, Ford, Mazda, Volkswagen, BMW, Mercedes-Benz, Peugeot, Renault, Fiat, Suzuki, Mitsubishi, Subaru, Audi, Jeep, Dodge
- Agregar nuevos modelos
- Contador de ordenes asociadas por marca

#### Cartera de Clientes
- **Filtros**: con saldo pendiente, pagados al dia, todos
- **KPIs**: cantidad de clientes, total facturado, saldo pendiente global
- **Tabla resumen**: nombre completo (nombre + apellido), telefono, RUT, patentes, visitas, generado, abonos, saldo
- **Informe detallado por cliente** (expandible): card con datos personales, vehiculos asociados, historial completo de visitas con #OT, fecha de atencion, vehiculo, servicios, total, abono, saldo, metodo de pago, estado
- **Recordatorios de revision**: registro automatico de patentes en sistema de recordatorios

#### Calendario de Agendamiento
- **FullCalendar v6**: calendario interactivo por tecnico
- **Drag & Drop**: mover eventos de fecha arrastrando
- **Asociar ordenes**: vincular ordenes existentes a eventos del calendario
- **Color por tecnico**: cada tecnico tiene un color asignado
- **Vistas**: mes, semana, dia, lista

#### Busqueda y Gestion de Ordenes
- **Busqueda por patente**: muestra hasta 20 resultados con desglose completo de costos
- **Vista detallada**: modal con toda la informacion de la orden, diagnostico, checklist, firma, fotos
- **Vista expandida**: desglose completo con costos adicionales, totales y opciones de edicion
- **Eliminacion**: con borrado en cascada de costos asociados
- **Lista completa**: todas las ordenes paginadas con filtros por estado, tipo express, y tecnico
- **Boton Ver en Linea**: abre la orden en el visor publico en nueva pestana

#### Configuracion del Sistema
- **WhatsApp UltraMsg**: configuracion de instancia y token con prueba de conexion
- **Domicilio**: parametros de calculo de distancia y tarifa (ver seccion dedicada)
- **Panel de notificaciones**: ver notificaciones pendientes/enviadas, generar links de WhatsApp manual

---

### 2. App del Tecnico (PWA)

Aplicacion movil progresiva que los tecnicos instalan en sus telefonos para gestionar sus ordenes en terreno.

#### Inicio de Sesion
- Autenticacion con numero de telefono + PIN
- Sesion persistente en `localStorage`
- Restauracion automatica de sesion al reabrir la app

#### Vista de Ordenes (3 pestanas)
- **Pendientes**: ordenes en estado "Pendiente Visita" esperando atencion del tecnico
- **En Curso**: ordenes activas (En Sitio, En Progreso, Pendiente Piezas)
- **Completadas**: ordenes finalizadas o cerradas

#### Tarjetas de Orden
- Numero de orden formateado (6 digitos)
- Nombre, telefono y direccion del cliente
- Patente, marca y modelo del vehiculo
- Badge de estado con colores
- Informacion de domicilio (distancia y cargo) cuando aplica

#### Modal de Detalle de Orden
- Servicios/diagnostico con precios del catalogo
- Checklist del vehiculo
- **Tarjeta de domicilio**: distancia recorrida, cargo, modo de pago
- **Fotos de trabajo**: visor de imagenes con pantalla completa
- **Notas**: historial de notas del tecnico
- **Historial de seguimiento**: linea de tiempo de cambios de estado con coordenadas GPS
- Indicador de cierre

#### Acciones de Trabajo (por estado)
- **Llegar al Sitio**: captura GPS, cambia estado a "En Sitio", calcula distancia y cargo de domicilio automaticamente, envia notificacion WhatsApp
- **Iniciar Trabajo**: captura GPS, cambia a "En Progreso"
- **Retomar Trabajo**: reanuda el trabajo pausado
- **Pedido Pendiente Piezas**: registra pausa por espera de repuestos
- **Completar**: cambia a "Completada"
- **Solicitar Firma**: genera token unico, abre modal para compartir link de firma con el cliente
- **Aceptado por Cliente**: confirma que el cliente esta satisfecho
- **No Completada**: registra trabajo no completado con motivo
- **Cerrar Orden**: cierre completo con notas, estado de pago, metodo de pago

#### Navegacion GPS
- Abre Google Maps con la direccion del cliente para navegacion paso a paso
- Link directo a la ruta optima

#### Fotos de Trabajo
- Captura desde camara o seleccion de galeria
- Clasificacion por tipo: antes, durante, despues
- Subida al servidor (Cloudflare R2 via S3 API) almacenada en tabla `FotosTrabajo`
- Visor de pantalla completa

#### Notas de Trabajo
- Agregar notas de texto por orden
- Historial con marcas de tiempo

#### Historial de Seguimiento
- Linea de tiempo completa de cambios de estado
- Nombre del tecnico, coordenadas GPS y observaciones por cada evento

#### Tracking GPS
- **Envio de ubicacion**: el tecnico puede enviar su ubicacion en tiempo real
- **Tracking publico**: via publica para ver la ubicacion del tecnico en un mapa

#### Sistema de Firma del Cliente
- Generacion de token unico para cada solicitud de firma
- Link compartible: `/aprobar-tecnico?token=xxx&notas=xxx&pago_completado=true&metodo_pago=Efectivo`
- El tecnico registra notas de cierre, estado de pago y metodo
- Opcion de enviar resumen con link de firma por WhatsApp
- El cliente firma y la orden se cierra automaticamente

#### PWA (Progressive Web App)
- **Service Worker** (`sw.js`) para funcionamiento offline parcial
- **Manifest** (`manifest.json`) para instalacion en pantalla de inicio
- Funciona como app nativa en Android e iOS

---

### 3. App del Cliente

Tres paginas web publicas donde los clientes interactuan con sus ordenes sin necesidad de cuenta ni instalacion.

#### Pagina de Aprobacion (`/aprobar?token=xxx`)
- Informacion completa de la orden: datos del cliente, vehiculo, servicios seleccionados con precios, checklist, costos adicionales, valores
- **Seccion de domicilio**: distancia recorrida y cargo cuando aplica
- **Canvas de firma**: optimizado para movil con eventos touch
- Botones: Aceptar y Firmar / Cancelar
- Pantalla de confirmacion con resumen
- Descarga de PDF y vista en linea
- Link de comparticion por WhatsApp

#### Pagina de Firma del Tecnico (`/aprobar-tecnico?token=xxx`)
- Iniciada por el tecnico tras completar el trabajo
- Muestra toda la informacion de la orden con los trabajos realizados
- **Seccion de domicilio**: distancia y cargo (pago directo al tecnico)
- Firma del cliente para cierre definitivo
- Cierra la orden automaticamente tras la firma

#### Visor Publico de OT (`/ver-ot?token=xxx`)
- Vista de solo lectura con toda la informacion de la orden
- Datos del taller, cliente, vehiculo
- Seccion de domicilio (distancia y cargo)
- Diagnostico/servicios, checklist, costos adicionales, valores, notas, firma
- Botones: Descargar PDF / Imprimir
- PDF profesional descargable con todas las secciones

---

### 4. Sistema de Notificaciones WhatsApp

Integracion con UltraMsg API para enviar notificaciones automaticas por WhatsApp.

#### Eventos con Notificacion
| Evento | Destinatario | Contenido |
|---|---|---|
| `orden_creada` | Cliente | Nueva orden + link de aprobacion |
| `orden_express_creada` | Cliente | Orden express creada (sin link) |
| `orden_asignada` | Tecnico | Orden asignada con datos |
| `tecnico_en_sitio` | Cliente | Tecnico llego al destino |
| `en_progreso` | Cliente | Trabajo iniciado |
| `completada` | Cliente | Trabajo completado |
| `cerrada` | Cliente | Orden cerrada con resumen |

#### Funcionalidades
- Normalizacion de numeros telefonicos (formato Chile: 569XXXXXXXX)
- Respaldo automatico en tabla `NotificacionesWhatsApp`
- Si UltraMsg no esta configurado, genera links `wa.me` para envio manual
- Panel admin: ver pendientes/enviadas, marcar como enviadas, generar links

---

### 5. Generacion de PDF

Tres puntos de generacion de PDF: admin, aprobacion del cliente y visor publico.

#### Contenido del PDF
1. **Encabezado**: marca de agua con logo (8% opacidad), barra roja con titulo, logo pequeno
2. **Informacion del Taller**: nombre, direccion, telefonos, redes sociales
3. **Datos del Cliente**: nombre, direccion, RUT, telefono, fecha de ingreso
4. **Datos del Vehiculo**: patente, marca/modelo, cilindrada, combustible, kilometraje
5. **Domicilio**: distancia recorrida y cargo por domicilio (siempre visible, incluso $0)
6. **Diagnostico / Servicios**: listado de servicios del catalogo con precios y tipo de comision
7. **Checklist del Vehiculo**: combustible, estado de carroceria
8. **Costos Adicionales**: desglose por categoria (mano de obra y repuestos)
9. **Valores**: total, abono, restante
10. **Notas**: notas de cierre y otras notas
11. **Firma del Cliente**: imagen PNG incrustada
12. **Pie de pagina**: timestamp de generacion, direccion del taller

#### Caracteristicas Tecnicas
- Formato A4 profesional
- Saltos de pagina automaticos para ordenes largas
- Numeracion correlativa de secciones
- Posibilidad de descargar o ver en linea

---

### 6. Sistema de Domicilios

Calculo automatico de distancia y cargo por traslado al domicilio del cliente.

#### Configuracion
- **Habilitar/deshabilitar**: toggle para activar el sistema
- **Ubicacion del taller**: coordenadas GPS (latitud y longitud) con deteccion automatica
- **Radio gratuito**: km de cobertura sin cargo (por defecto 5 km)
- **Tarifa por km**: valor a cobrar por cada km facturable (por defecto $500)
- **Cargo minimo**: tarifa minima por domicilio (por defecto $1.000)
- **Modo de cobro**: pago directo al tecnico, no cobrar, o sumar a factura
- **Cobertura maxima**: distancia maxima de cobertura (por defecto 50 km)
- **Prueba de distancia**: simulador con coordenadas GPS

#### Calculo
1. Cuando el tecnico presiona "Llegar al Sitio", se capturan sus coordenadas GPS
2. Se calcula la distancia real por ruta via API OSRM
3. Si OSRM falla, se usa la formula de Haversine x 1.3 como factor de correccion
4. Se aplica la tarifa configurada: si la distancia > radio gratuito, se cobra (distancia - radio) x tarifa
5. Se asegura el cargo minimo si corresponde
6. El resultado se guarda en la orden (distancia_km, cargo_domicilio, domicilio_modo_cobro)

#### Visualizacion
El valor del domicilio se muestra en **todas** las vistas del sistema: app del tecnico, panel admin, OT publica, paginas de aprobacion, y todos los PDF generados. Aparece incluso cuando es $0 o no ha sido calculado.

---

## Flujo de Trabajo

```
ADMIN crea orden                  CLIENTE aprueba                 TECNICO ejecuta
==================                ================                =================

 Crear orden --------+           /aprobar?token=xxx
 (catalogo de         |          Firma digital canvas
  servicios,          v          Aprueba 0  Cancela
  tecnico OBLIGATORIO,
  checklist,          Enviada
  valores)
                      |
                      +-------> WhatsApp: "Tienes nueva OT"
                      |
                              Aprobada --------+
                              (con firma)      |
                                                v
                                      Asignar a Tecnico
                                                |
                                                v
                                      Pendiente Visita
                                                |
                      TECNICO en app           |
                      Navegar GPS  <-----------+
                      "Llegar al Sitio"
                      (captura GPS, calcula
                       domicilio automatico)
                                |
                                v
                            En Sitio ---------> WhatsApp: notificar
                                |
                                v
                            En Progreso -----> WhatsApp: notificar
                       (subir fotos,
                        agregar notas)
                                |
                                v
                       Completada
                                |
                    +-----------+-----------+
                    |           |           |
                    v           v           v
             Solicitar     No Completada  Cerrar
             Firma         (con motivo)  (notas, pago)
                    |
                    v
              Genera link
              /aprobar-tecnico

              O usar candado rojo ----> SIN DEUDA
              (desde cualquier vista)  restante=$0, pagado=1
                                         |
                                         v
              O usar candado verde ----> REABRIR
              (desde cualquier vista)    Pendiente Visita
                    |
                    v
              CLIENTE firma
              + cierra orden
                    |
                    v
              Usuario Satisfecho ----> Cerrada
```

---

## Base de Datos

16+ tablas en Cloudflare D1 (SQLite) con sistema de migracion automatica:

| Tabla | Descripcion |
|---|---|
| `OrdenesTrabajo` | Ordenes de trabajo con todos los campos (cliente, apellido, vehiculo, servicios JSON, diagnostico, firma, domicilio, pagado, etc.) |
| `Clientes` | Registro de clientes (nombre, RUT, telefono, email) |
| `Vehiculos` | Registro de vehiculos vinculados a clientes |
| `Tecnicos` | Registro de tecnicos (nombre, apellido, telefono, PIN, comision_porcentaje) |
| `CostosAdicionales` | Costos extra por orden (mano de obra y repuestos) |
| `GastosNegocio` | Gastos operativos del negocio |
| `Pagos` | Registros de pagos recibidos |
| `Configuracion` | Configuracion general y numeracion de ordenes |
| `ConfigKV` | Store clave-valor para configuraciones dinamicas |
| `ServiciosCatalogo` | Catalogo de servicios con precios y tipos de comision |
| `ModelosVehiculo` | Marcas y modelos de vehiculos |
| `NotificacionesWhatsApp` | Historial de notificaciones enviadas/pendientes |
| `FotosTrabajo` | Fotos de trabajo subidas por los tecnicos (almacenadas en R2) |
| `NotasTrabajo` | Notas de trabajo por orden |
| `SeguimientoTrabajo` | Historial de cambios de estado con GPS |
| `SesionesAdmin` | Sesiones activas del panel administrativo |
| `AdminUsers` | Usuarios administradores |
| `LiquidacionOrden` | Liquidaciones manuales de ordenes (comisiones y domicilios por tecnico) |
| `AgendaTecnicos` | Eventos del calendario de agendamiento |

#### Migracion Automatica
El sistema incluye un sistema de migracion dinamica que:
- Crea tablas automaticamente si no existen (`asegurarColumnasFaltantes`)
- Agrega columnas faltantes con `ALTER TABLE`
- Detecta columnas disponibles con `PRAGMA table_info()`
- Construye queries SQL dinamicamente segun el esquema disponible
- Se ejecuta automaticamente al primer request de cada endpoint

#### Campo `servicios_seleccionados` (JSON)
Este campo en `OrdenesTrabajo` es clave para el sistema de comisiones. Cada item tiene:
```json
[
  {
    "id": 1,
    "nombre": "Cambio de frenos delanteros",
    "precio_sugerido": 15000,
    "precio_final": 15000,
    "categoria": "Reparacion",
    "tipo_comision": "mano_obra",
    "tecnico_id": 3,
    "tecnico_nombre": "Juan Perez",
    "descripcion": "Frenos ceramicos",
    "editado": false
  }
]
```
- `tecnico_id`: Identifica a que tecnico corresponde este item para la liquidacion
- `tipo_comision`: `"mano_obra"` genera comision, `"repuestos"` NO genera comision
- Si `tecnico_id` no existe (ordenes antiguas), se usa `tecnico_asignado_id` como fallback

---

## API Endpoints - Referencia Completa

### Endpoints Publicos (Cliente)

| Metodo | Endpoint | Descripcion | Parametros |
|---|---|---|---|
| `POST` | `/api/crear-orden` | Crear orden (normal o express) | Body JSON con todos los campos de la orden |
| `POST` | `/api/aprobar-orden` | Aprobar orden con firma del cliente | `orden_id`, `firma_base64`, `token` |
| `POST` | `/api/cancelar-orden` | Cancelar orden | `orden_id`, `token` |
| `GET` | `/api/ver-orden` | Ver orden por ID o token | `?id=X` o `?token=X` |
| `PUT` | `/api/editar-orden` | Editar orden existente | Body JSON (solo campos a actualizar) |
| `GET` | `/api/buscar-patente` | Buscar vehiculo/cliente por patente | `?patente=ABC123` |
| `GET` | `/api/buscar-ordenes` | Buscar ordenes por patente | `?patente=ABC123` |
| `GET` | `/api/proximo-numero-orden` | Obtener proximo numero de orden secuencial | - |
| `POST` | `/api/public/crear-orden-express` | Crear orden express (publico, sin auth) | Body JSON |
| `GET` | `/api/public/listar-ordenes-express` | Listar ordenes express (read-only publico) | `?limit=X` |
| `GET` | `/api/imagen` | Servir imagen desde R2 via S3 API | `?key=X` |
| `GET` | `/api/tracking` | Tracking publico (ver ubicacion del tecnico) | `?orden_id=X` |

### Endpoints Admin

| Metodo | Endpoint | Descripcion |
|---|---|---|
| `GET` | `/api/admin/login` | Validar sesion admin |
| `POST` | `/api/admin/login` | Login con credenciales |
| `GET` | `/api/admin/dashboard-negocio` | Dashboard con KPIs, filtros por periodo |
| `GET` | `/api/admin/todas-ordenes` | Listar TODAS las ordenes (paginado, filtros por estado/express/tecnico) |
| `GET` | `/api/admin/ordenes-express` | Dashboard dedicado de ordenes Express |
| `GET` | `/api/admin/ordenes-aprobadas` | Ordenes aprobadas para mostrar a tecnicos |
| `GET` | `/api/admin/ordenes-disponibles` | Ordenes sin asignar a ningun tecnico |
| `GET` | `/api/admin/ordenes-asignadas` | Ordenes asignadas a un tecnico especifico |
| `GET` | `/api/admin/tecnicos` | Listar tecnicos (con filtro activos) |
| `POST` | `/api/admin/tecnicos` | Crear nuevo tecnico |
| `PUT` | `/api/admin/tecnicos` | Editar tecnico existente |
| `DELETE` | `/api/admin/tecnicos` | Eliminar tecnico |
| `POST` | `/api/admin/asignar-orden` | Asignar/reasignar orden a tecnico |
| `POST` | `/api/admin/liberar-orden` | Liberar orden de tecnico asignado |
| `DELETE` | `/api/admin/eliminar-orden` | Eliminar orden (cascade: costos, firma, etc.) |
| `GET` | `/api/admin/liquidar-tecnicos` | Liquidacion de tecnicos (por tecnico_id y periodo) |
| `GET` | `/api/admin/liquidar-ordenes` | Listar ordenes para liquidacion manual |
| `POST` | `/api/admin/liquidar-ordenes` | Crear liquidacion de orden |
| `DELETE` | `/api/admin/liquidar-ordenes` | Eliminar liquidacion de orden |
| `GET` | `/api/admin/resumen-pagos` | Resumen de pagos y flujo de caja |
| `GET` | `/api/admin/gastos` | Listar gastos (con filtro por fechas) |
| `POST` | `/api/admin/gastos` | Crear gasto |
| `DELETE` | `/api/admin/gastos` | Eliminar gasto |
| `GET` | `/api/admin/costos-adicionales` | Listar costos adicionales de una orden |
| `POST` | `/api/admin/costos-adicionales` | Agregar costo adicional |
| `PUT` | `/api/admin/costos-adicionales` | Editar costo adicional |
| `DELETE` | `/api/admin/costos-adicionales` | Eliminar costo adicional |
| `GET` | `/api/admin/servicios-catalogo` | Listar catalogo de servicios (con busqueda y filtro activos) |
| `POST` | `/api/admin/servicios-catalogo` | Crear servicio en catalogo |
| `PUT` | `/api/admin/servicios-catalogo` | Editar servicio |
| `DELETE` | `/api/admin/servicios-catalogo` | Desactivar servicio (soft delete) |
| `GET` | `/api/admin/modelos-vehiculo` | Listar modelos de vehiculos |
| `POST` | `/api/admin/modelos-vehiculo` | Agregar modelo |
| `GET` | `/api/admin/config-domicilio` | Obtener configuracion de domicilio |
| `POST` | `/api/admin/config-domicilio` | Guardar configuracion de domicilio |
| `GET` | `/api/admin/ultramsg` | Obtener configuracion WhatsApp |
| `POST` | `/api/admin/ultramsg` | Guardar configuracion WhatsApp |
| `GET` | `/api/admin/notificaciones` | Listar notificaciones |
| `POST` | `/api/admin/notificaciones` | Crear/marcar notificacion |
| `POST` | `/api/admin/fix-saldos` | Forzar saldos de TODAS las ordenes cerradas a $0 sin deuda |
| `GET` | `/api/admin/exportar-datos` | Exportar todos los datos del sistema |
| `GET` | `/api/admin/migrar` | Ejecutar migracion automatica de BD |
| `GET` | `/api/admin/calendario` | Listar eventos del calendario |
| `POST` | `/api/admin/calendario` | Crear evento del calendario |
| `PUT` | `/api/admin/calendario` | Editar evento |
| `DELETE` | `/api/admin/calendario` | Eliminar evento |
| `GET` | `/api/admin/test-r2` | Test de conexion a Cloudflare R2 |

### Endpoints Tecnico

| Metodo | Endpoint | Descripcion |
|---|---|---|
| `POST` | `/api/tecnico/login` | Login con telefono + PIN |
| `GET` | `/api/tecnico/ordenes` | Obtener ordenes del tecnico (pendientes/en curso/completadas) |
| `GET` | `/api/tecnico/orden` | Detalle de una orden especifica |
| `POST` | `/api/tecnico/cambiar-estado` | Cambiar estado (con GPS, calcula domicilio automaticamente) |
| `POST` | `/api/tecnico/cerrar-orden` | Cerrar orden con datos de pago |
| `POST` | `/api/tecnico/subir-foto` | Subir foto de trabajo a R2 |
| `GET` | `/api/tecnico/fotos` | Ver fotos de una orden |
| `GET` | `/api/tecnico/historial` | Historial de seguimiento de una orden |
| `GET` | `/api/tecnico/notas` | Ver notas de una orden |
| `POST` | `/api/tecnico/agregar-nota` | Agregar nota a una orden |
| `POST` | `/api/tecnico/generar-token-firma` | Generar token unico para firma del cliente |
| `POST` | `/api/tecnico/tracking` | Enviar ubicacion GPS del tecnico |

### Endpoints de Paginas

| Metodo | Endpoint | Descripcion |
|---|---|---|
| `GET` | `/aprobar` | Pagina de aprobacion de orden (firma del cliente) |
| `GET` | `/aprobar-tecnico` | Pagina de firma iniciada por el tecnico |
| `GET` | `/ver-ot` | Visor publico de OT con PDF descargable |

### Librerias Internas

| Archivo | Descripcion |
|---|---|
| `functions/lib/db-helpers.js` | Utilidades de BD: migracion automatica, obtencion de columnas, filtros de fecha, COALESCE de campos faltantes |
| `functions/lib/notificaciones.js` | Motor de notificaciones WhatsApp via UltraMsg, normalizacion de telefonos, generacion de links wa.me |
| `functions/lib/calculo-distancia.js` | Calculo de distancia (OSRM + Haversine fallback), tarifa de domicilio, modo de cobro |
| `functions/lib/s3-client.js` | Cliente S3 para interactuar con Cloudflare R2 (subir/leer/eliminar imagenes) |

---

## Estructura del Proyecto

```
sgc-ordenes/
├── index.html                          # Panel administrativo (HTML)
├── app.js                              # Panel administrativo (logica JS, ~9100 lineas)
├── banner.jpeg                         # Banner del taller
├── corto.jpg                           # Logo del taller
├── package.json                        # Dependencias
├── wrangler.toml                       # Configuracion Cloudflare Workers + D1
├── docs/
│   └── INSTALACION.md                  # Guia de instalacion
├── functions/
│   ├── lib/
│   │   ├── db-helpers.js               # Utilidades de BD (migracion, columnas, fechas)
│   │   ├── notificaciones.js           # Motor de notificaciones WhatsApp
│   │   ├── calculo-distancia.js        # Calculo de distancia y tarifa de domicilio
│   │   └── s3-client.js                # Cliente S3 para Cloudflare R2
│   ├── api/
│   │   ├── crear-orden.js              # Crear orden (normal + express)
│   │   ├── ver-orden.js                # Ver orden detallada (por ID o token)
│   │   ├── aprobar-orden.js            # Aprobar orden con firma
│   │   ├── cancelar-orden.js           # Cancelar orden
│   │   ├── editar-orden.js             # Editar orden (solo campos enviados, sin resetear)
│   │   ├── buscar-patente.js           # Buscar vehiculo por patente
│   │   ├── buscar-ordenes.js           # Buscar ordenes por patente
│   │   ├── proximo-numero-orden.js     # Proximo numero secuencial
│   │   ├── imagen.js                   # Servir imagen desde R2
│   │   ├── tracking.js                 # Tracking publico (ubicacion tecnico)
│   │   ├── admin/                      # 27 endpoints de administracion
│   │   │   ├── login.js                # Login y sesion admin
│   │   │   ├── dashboard-negocio.js    # KPIs del negocio
│   │   │   ├── todas-ordenes.js        # Listar todas las ordenes
│   │   │   ├── ordenes-express.js      # Dashboard ordenes express
│   │   │   ├── ordenes-aprobadas.js    # Ordenes aprobadas
│   │   │   ├── ordenes-disponibles.js  # Ordenes sin asignar
│   │   │   ├── ordenes-asignadas.js    # Ordenes asignadas
│   │   │   ├── tecnicos.js             # CRUD tecnicos
│   │   │   ├── asignar-orden.js        # Asignar orden a tecnico
│   │   │   ├── liberar-orden.js        # Liberar orden
│   │   │   ├── eliminar-orden.js       # Eliminar orden (cascade)
│   │   │   ├── liquidar-tecnicos.js    # Liquidacion por comisiones
│   │   │   ├── liquidar-ordenes.js     # Liquidacion manual de ordenes
│   │   │   ├── resumen-pagos.js        # Flujo de caja
│   │   │   ├── gastos.js               # CRUD gastos
│   │   │   ├── costos-adicionales.js   # CRUD costos por orden
│   │   │   ├── servicios-catalogo.js   # CRUD catalogo servicios
│   │   │   ├── modelos-vehiculo.js     # CRUD modelos vehiculos
│   │   │   ├── config-domicilio.js     # Configuracion domicilios
│   │   │   ├── ultramsg.js             # Configuracion WhatsApp
│   │   │   ├── notificaciones.js       # Gestion notificaciones
│   │   │   ├── fix-saldos.js           # Forzar saldos sin deuda
│   │   │   ├── calendario.js           # Calendario de agendamiento
│   │   │   ├── exportar-datos.js       # Exportar datos
│   │   │   ├── migrar.js               # Migracion automatica BD
│   │   │   └── test-r2.js              # Test conexion R2
│   │   ├── public/                     # Endpoints publicos (sin auth)
│   │   │   ├── crear-orden-express.js  # Crear orden express publico
│   │   │   └── listar-ordenes-express.js # Listar ordenes express
│   │   └── tecnico/                    # 12 endpoints del tecnico
│   │       ├── login.js                # Login (telefono + PIN)
│   │       ├── ordenes.js              # Ordenes del tecnico
│   │       ├── orden.js                # Detalle de orden
│   │       ├── cambiar-estado.js       # Cambiar estado (GPS + domicilio)
│   │       ├── cerrar-orden.js         # Cerrar orden
│   │       ├── subir-foto.js           # Subir foto a R2
│   │       ├── fotos.js                # Ver fotos
│   │       ├── notas.js                # Ver notas
│   │       ├── agregar-nota.js         # Agregar nota
│   │       ├── historial.js            # Historial seguimiento
│   │       ├── generar-token-firma.js  # Generar token firma
│   │       └── tracking.js             # Enviar ubicacion GPS
│   ├── aprobar/_middleware.js          # Middleware pagina aprobacion
│   ├── aprobar/index.js                # Pagina aprobacion del cliente
│   ├── aprobar-tecnico/index.js        # Pagina firma (iniciada por tecnico)
│   └── ver-ot/index.js                 # Visor publico de OT + PDF
└── tecnico/
    ├── app.html                        # App del tecnico (HTML)
    ├── app.js                          # App del tecnico (logica JS)
    ├── sw.js                           # Service Worker (PWA offline)
    └── manifest.json                   # Manifest PWA (instalable)
```

---

## Instalacion

### Requisitos
- Cuenta de Cloudflare (gratuita)
- Node.js 18+
- Git

### Pasos

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/bboymak3/SGC-Ordenes.git
   cd SGC-Ordenes
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Crear base de datos D1**
   ```bash
   npx wrangler d1 create sgc-db
   ```

4. **Configurar binding en `wrangler.toml`**
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "sgc-db"
   database_id = "TU_DATABASE_ID"
   ```

5. **Desplegar en Cloudflare Pages**
   ```bash
   npx wrangler pages deploy . --project-name=sgc-ordenes
   ```

   Las tablas se crearan automaticamente al primer request (migracion automatica via `asegurarColumnasFaltantes`).

6. **Configurar** (desde el panel admin)
   - Iniciar sesion como administrador
   - Configurar credenciales de WhatsApp UltraMsg (opcional)
   - Configurar ubicacion del taller para domicilios (opcional)
   - Crear tecnicos y asignar PINs
   - Agregar servicios al catalogo

Para instrucciones detalladas, consultar [docs/INSTALACION.md](docs/INSTALACION.md).

---

## Licencia

Este proyecto fue desarrollado para **SGC**.
