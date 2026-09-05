// src/types.ts — TypeScript types for SGC Citas

export interface Env {
  AI: Ai;
  DB: D1Database;           // DB propia del chat (citas) — lectura/escritura
  TALLER_DB: D1Database;     // sgc_ordenes_db — SOLO LECTURA
  ASSETS: Fetcher;
  BUSINESS_PHONE: string;
  BUSINESS_NAME: string;
  SGCORDENES_URL: string;   // URL de SGC-Ordenes para enviar órdenes
  ULTRAMSG_INSTANCE_ID?: string;
  ULTRAMSG_TOKEN?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CitaRequest {
  patente: string;
  nombre: string;
  apellido?: string;
  telefono: string;
  email?: string;
  servicio: string;
  fecha: string;
  hora: string;
  observaciones?: string;
  marca?: string;
  modelo?: string;
  anio?: number;
  color?: string;
  tipo_atencion?: string;
  canal?: string;
  direccion?: string;
  referencia_direccion?: string;
  requerimientos?: string;
}

export interface CitaRecord {
  id: number;
  patente: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  cilindrada: string | null;
  nombre_cliente: string;
  telefono: string;
  email: string | null;
  servicio: string;
  fecha_cita: string;
  hora_cita: string;
  duracion_minutos: number;
  observaciones: string | null;
  estado: string;
  canal: string;
  notificada_negocio: number;
  notificada_cliente: number;
  recordatorio_enviado: number;
  orden_enviada: number;      // 1 si se envió a SGC-Ordenes
  numero_orden_sgc: string | null;
  created_at: string;
  updated_at: string;
}

export interface Servicio {
  id: number;
  nombre: string;
  descripcion: string | null;
  icono: string;
  duracion_minutos: number;
  precio_min: string | null;
  activo: number;
  orden: number;
}

export interface Horario {
  dia_semana: string;
  hora_apertura: string;
  hora_cierre: string;
  intervalo_minutos: number;
  activo: number;
}

export interface SlotDisponible {
  hora: string;
  disponibles: number;
  maximo: number;
}

export interface VehiculoTaller {
  id: number;
  patente_placa: string;
  marca: string;
  modelo: string;
  anio: number;
  cilindrada: string | null;
  combustible: string | null;
  kilometraje: string | null;
  color: string | null;
  cliente_id: number;
  fecha_registro: string;
  // Cliente asociado
  cliente_nombre?: string;
  cliente_telefono?: string;
  cliente_rut?: string;
  // Órdenes recientes
  total_ordenes?: number;
  ultima_orden?: {
    numero_orden: number;
    fecha_ingreso: string;
    servicios_seleccionados: string | null;
    estado: string;
    monto_total: number;
  };
}
