// chat.js — GlobalPro Citas Frontend
// Chat con LLM + Flujo de agendamiento conversacional

(function() {
  'use strict';

  // ─── State Machine ──────────────────────────────────────
  const STATES = {
    IDLE: 'idle',
    ASKING_PATENTE: 'asking_patente',
    SHOWING_SERVICIOS: 'showing_servicios',
    PICKING_DATETIME: 'picking_datetime',
    ASKING_CONTACT: 'asking_contact',
    CONFIRMING: 'confirming',
    COMPLETED: 'completed',
  };

  let currentState = STATES.IDLE;
  let citaData = {};           // Accumulated appointment data
  let chatHistory = [];        // Chat history for LLM context
  let isProcessing = false;     // Prevent duplicate sends
  let currentPatente = '';     // Current patent being discussed

  // ─── DOM Elements ───────────────────────────────────────
  const container = document.getElementById('chatContainer');
  const typing = document.getElementById('typingIndicator');
  const input = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');

  // ─── Auto-resize textarea ──────────────────────────────
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });

  // ─── Enter to send ─────────────────────────────────────
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // ─── Initialize ────────────────────────────────────────
  async function init() {
    addBotMessage(
      '¡Hola! 👋 Soy el asistente virtual de **Global Pro Automotriz**.\n\n' +
      'Puedo ayudarte a:\n' +
      '📅 **Agendar una cita** de servicio\n' +
      '🔍 **Consultar** el historial de tu vehículo\n' +
      '❓ **Información** sobre nuestros servicios\n\n' +
      '¿En qué puedo ayudarte hoy?'
    );
    showQuickActions([
      { label: '📅 Agendar Cita', value: 'agendar', primary: true },
      { label: '🔍 Consultar Vehículo', value: 'consultar' },
      { label: '❓ Nuestros Servicios', value: 'servicios' },
      { label: '📞 Contactar', value: 'contactar' },
    ]);
  }

  // ─── Render Functions ──────────────────────────────────

  function addBotMessage(text, html) {
    const div = document.createElement('div');
    div.className = 'message message-bot';
    if (html) {
      div.innerHTML = html;
    } else {
      div.innerHTML = formatText(text);
    }
    container.insertBefore(div, typing);
    scrollToBottom();
  }

  function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message message-user';
    div.textContent = text;
    container.insertBefore(div, typing);
    scrollToBottom();
  }

  function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'message message-system';
    div.textContent = text;
    container.insertBefore(div, typing);
    scrollToBottom();
  }

  function formatText(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
      .replace(/- /g, '&bull; ');
  }

  function showQuickActions(actions) {
    // Remove existing quick actions
    const existing = container.querySelectorAll('.quick-actions');
    existing.forEach(el => el.remove());

    if (!actions || actions.length === 0) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'quick-actions';
    actions.forEach(action => {
      const btn = document.createElement('button');
      btn.className = 'quick-btn' + (action.primary ? ' primary' : '');
      btn.innerHTML = action.label;
      btn.onclick = () => handleQuickAction(action.value, action.label);
      wrapper.appendChild(btn);
    });
    container.insertBefore(wrapper, typing);
    scrollToBottom();
  }

  function showPatenteInput() {
    const existing = container.querySelectorAll('.patente-input-wrapper');
    existing.forEach(el => el.remove());

    const wrapper = document.createElement('div');
    wrapper.className = 'patente-input-wrapper';
    wrapper.innerHTML = `
      <label>Ingresa tu patente/placa</label>
      <div class="patente-input-row">
        <input type="text" id="patenteInput" placeholder="Ej: ABCD12" maxlength="8" autocomplete="off">
        <button class="patente-btn" id="patenteBtn"><i class="fas fa-search"></i></button>
      </div>
    `;
    container.insertBefore(wrapper, typing);
    scrollToBottom();

    const patenteInput = document.getElementById('patenteInput');
    const patenteBtn = document.getElementById('patenteBtn');

    patenteInput.focus();
    patenteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handlePatenteSubmit(patenteInput.value);
      }
    });
    patenteBtn.addEventListener('click', () => {
      handlePatenteSubmit(patenteInput.value);
    });
  }

  function showServiceSelector(servicios) {
    const existing = container.querySelectorAll('.service-selector');
    existing.forEach(el => el.remove());

    const wrapper = document.createElement('div');
    wrapper.className = 'service-selector';
    wrapper.innerHTML = `<h4>Selecciona un servicio</h4><div class="service-list" id="serviceList"></div>`;
    container.insertBefore(wrapper, typing);

    const list = document.getElementById('serviceList');
    servicios.forEach(s => {
      const item = document.createElement('button');
      item.className = 'service-item';
      item.innerHTML = `
        <i class="fas fa-${s.icono || 'wrench'}"></i>
        <div class="service-item-info">
          <div class="service-item-name">${escapeHtml(s.nombre)}</div>
          <div class="service-item-detail">${s.precio_min ? escapeHtml(s.precio_min) + ' — ' : ''}${s.duracion_minutos} min</div>
        </div>
      `;
      item.onclick = () => handleServiceSelect(s, item);
      list.appendChild(item);
    });
    scrollToBottom();
  }

  function showDateTimePicker() {
    const existing = container.querySelectorAll('.datetime-picker');
    existing.forEach(el => el.remove());

    const wrapper = document.createElement('div');
    wrapper.className = 'datetime-picker';
    wrapper.innerHTML = `
      <h4>Selecciona fecha y hora</h4>
      <input type="date" id="citaFecha" min="${getMinDate()}">
      <h4 style="margin-top:8px;">Horarios disponibles</h4>
      <div class="time-slots" id="timeSlots">
        <div style="color:#9ca3af;font-size:0.82rem;">Selecciona una fecha primero</div>
      </div>
    `;
    container.insertBefore(wrapper, typing);
    scrollToBottom();

    const fechaInput = document.getElementById('citaFecha');
    fechaInput.addEventListener('change', () => loadTimeSlots(fechaInput.value));
    fechaInput.focus();
  }

  function showConfirmation() {
    const existing = container.querySelectorAll('.confirm-card');
    existing.forEach(el => el.remove());

    const wrapper = document.createElement('div');
    wrapper.className = 'confirm-card';
    wrapper.innerHTML = `
      <h4><i class="fas fa-clipboard-check"></i> Confirmar Cita</h4>
      <div class="confirm-row"><span class="confirm-label">Patente</span><span class="confirm-value">${escapeHtml(citaData.patente)}</span></div>
      ${citaData.marca ? `<div class="confirm-row"><span class="confirm-label">Vehículo</span><span class="confirm-value">${escapeHtml(citaData.marque || citaData.marca)} ${escapeHtml(citaData.modelo || '')}</span></div>` : ''}
      <div class="confirm-row"><span class="confirm-label">Servicio</span><span class="confirm-value">${escapeHtml(citaData.servicio)}</span></div>
      <div class="confirm-row"><span class="confirm-label">Fecha</span><span class="confirm-value">${formatDate(citaData.fecha)}</span></div>
      <div class="confirm-row"><span class="confirm-label">Hora</span><span class="confirm-value">${escapeHtml(citaData.hora)}</span></div>
      <div class="confirm-row"><span class="confirm-label">Nombre</span><span class="confirm-value">${escapeHtml(citaData.nombre)}</span></div>
      <div class="confirm-row"><span class="confirm-label">Teléfono</span><span class="confirm-value">${escapeHtml(citaData.telefono)}</span></div>
      ${citaData.observaciones ? `<div class="confirm-row"><span class="confirm-label">Notas</span><span class="confirm-value">${escapeHtml(citaData.observaciones)}</span></div>` : ''}
      <div class="confirm-actions">
        <button class="btn-cancel" id="btnCancelCita">Cancelar</button>
        <button class="btn-confirm" id="btnConfirmCita">✅ Confirmar Cita</button>
      </div>
    `;
    container.insertBefore(wrapper, typing);
    scrollToBottom();

    document.getElementById('btnConfirmCita').addEventListener('click', confirmAppointment);
    document.getElementById('btnCancelCita').addEventListener('click', cancelAppointment);
  }

  // ─── Event Handlers ────────────────────────────────────

  function handleQuickAction(value) {
    switch (value) {
      case 'agendar':
        startScheduling();
        break;
      case 'consultar':
        showPatenteInput();
        break;
      case 'servicios':
        showServicesList();
        break;
      case 'contactar':
        addUserMessage('Quiero contactar por WhatsApp');
        addBotMessage(
          'Puedes contactarnos directamente por WhatsApp:\n\n' +
          '📞 **+56 9 3902 6185**\n\n' +
          '[Haz clic aquí para escribirnos](https://wa.me/56939026185?text=Hola,%20quiero%20información%20sobre%20servicios)'
        );
        showQuickActions([
          { label: '📅 Agendar Cita', value: 'agendar', primary: true },
          { label: '🔍 Consultar Vehículo', value: 'consultar' },
        ]);
        break;
    }
  }

  async function handlePatenteSubmit(patente) {
    if (!patente || patente.trim().length < 3) {
      addSystemMessage('Por favor ingresa una patente válida');
      return;
    }

    patente = patente.trim().toUpperCase();
    addUserMessage(patente);
    currentPatente = patente;

    // Remove the patente input
    const inputWrapper = container.querySelectorAll('.patente-input-wrapper');
    inputWrapper.forEach(el => el.remove());

    setTyping(true);

    try {
      // Consult vehicle API
      const response = await fetch('/api/consultar-vehiculo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patente }),
      });
      const data = await response.json();

      setTyping(false);

      if (data.success && data.vehiculo) {
        const v = data.vehiculo;
        citaData.patente = v.patente_placa;
        citaData.marca = v.marca;
        citaData.modelo = v.modelo;
        citaData.anio = v.anio;
        if (v.cliente) {
          citaData.nombre = v.cliente.nombre;
          citaData.telefono = v.cliente.telefono;
        }

        let msg = `Encontré tu vehículo 🚗\n\n`;
        msg += `**${v.marca} ${v.modelo} ${v.anio}** — Patente: ${v.patente_placa}\n`;
        if (v.kilometraje) msg += `📊 Kilometraje: ${v.kilometraje}\n`;
        if (v.combustible) msg += `⛽ Combustible: ${v.combustible}\n`;
        if (v.total_ordenes > 0) msg += `🔧 Tiene ${v.total_ordenes} orden(es) de servicio registradas`;

        addBotMessage(msg);

        if (currentState === STATES.ASKING_PATENTE) {
          // Continue scheduling flow
          addBotMessage('¿Qué servicio necesitas para tu vehículo?');
          loadAndShowServicios();
          currentState = STATES.SHOWING_SERVICIOS;
        } else {
          // Just consultation mode
          showQuickActions([
            { label: '📅 Agendar Cita para este vehículo', value: 'agendar_with_vehicle', primary: true },
            { label: '🔍 Consultar otra patente', value: 'consultar' },
          ]);
        }
      } else {
        addBotMessage(
          'No encontré registros para esa patente en nuestro sistema. ' +
          'Pero no te preocupes, ¡igual puedes agendar tu cita! 🚗\n\n' +
          '¿Qué servicio necesitas?'
        );
        citaData.patente = patente;
        if (currentState === STATES.ASKING_PATENTE) {
          loadAndShowServicios();
          currentState = STATES.SHOWING_SERVICIOS;
        } else {
          showQuickActions([
            { label: '📅 Agendar Cita', value: 'agendar', primary: true },
            { label: '🔍 Consultar otra patente', value: 'consultar' },
          ]);
        }
      }
    } catch (error) {
      setTyping(false);
      addBotMessage('No pude consultar la patente en este momento. Intenta de nuevo más tarde.');
      console.error('Patente lookup error:', error);
    }
  }

  async function loadAndShowServicios() {
    try {
      const response = await fetch('/api/servicios');
      const data = await response.json();
      if (data.servicios) {
        showServiceSelector(data.servicios);
      }
    } catch (error) {
      addBotMessage('¿Qué servicio necesitas? (Ej: Cambio de aceite, Revisión general, Scanner, etc.)');
    }
  }

  async function showServicesList() {
    try {
      const response = await fetch('/api/servicios');
      const data = await response.json();
      if (data.servicios) {
        let msg = '🛠️ **Nuestros Servicios:**\n\n';
        data.servicios.forEach((s, i) => {
          msg += `${i + 1}. **${s.nombre}**${s.precio_min ? ' — ' + s.precio_min : ''}\n`;
          if (s.descripcion) msg += `   _${s.descripcion}_\n`;
        });
        msg += '\n¿Te gustaría agendar una cita con alguno de estos servicios?';
        addBotMessage(msg);
        showQuickActions([
          { label: '📅 Agendar Cita', value: 'agendar', primary: true },
          { label: '🔍 Consultar Vehículo', value: 'consultar' },
        ]);
      }
    } catch (error) {
      addBotMessage('No pude cargar los servicios. Intenta de nuevo.');
    }
  }

  function handleServiceSelect(servicio, element) {
    // Deselect all
    const items = container.querySelectorAll('.service-item');
    items.forEach(i => i.classList.remove('selected'));
    element.classList.add('selected');

    citaData.servicio = servicio.nombre;
    addUserMessage(servicio.nombre);

    // Remove service selector
    setTimeout(() => {
      const selector = container.querySelectorAll('.service-selector');
      selector.forEach(el => el.remove());

      addBotMessage('¡Perfecto! Ahora selecciona la fecha y hora que prefieres 📅');
      showDateTimePicker();
      currentState = STATES.PICKING_DATETIME;
    }, 400);
  }

  async function loadTimeSlots(fecha) {
    const slotsContainer = document.getElementById('timeSlots');
    if (!slotsContainer) return;
    slotsContainer.innerHTML = '<div style="color:#9ca3af;font-size:0.82rem;">Cargando horarios...</div>';

    try {
      const response = await fetch(`/api/disponibilidad?fecha=${fecha}`);
      const data = await response.json();

      if (data.cerrado) {
        slotsContainer.innerHTML = '<div style="color:#ef4444;font-size:0.82rem;">❌ No hay disponibilidad para esta fecha</div>';
        return;
      }

      if (data.slots.length === 0) {
        slotsContainer.innerHTML = '<div style="color:#ef4444;font-size:0.82rem;">❌ No hay horarios disponibles</div>';
        return;
      }

      slotsContainer.innerHTML = '';
      data.slots.forEach(slot => {
        const btn = document.createElement('button');
        btn.className = 'time-slot' + (slot.disponibles <= 0 ? ' full' : '');
        btn.textContent = slot.hora;
        if (slot.disponibles <= 0) {
          btn.title = 'Completo';
        } else {
          btn.onclick = () => handleTimeSelect(slot, btn);
        }
        slotsContainer.appendChild(btn);
      });
    } catch (error) {
      slotsContainer.innerHTML = '<div style="color:#ef4444;font-size:0.82rem;">Error al cargar horarios</div>';
    }
  }

  function handleTimeSelect(slot, element) {
    const slots = container.querySelectorAll('.time-slot');
    slots.forEach(s => s.classList.remove('selected'));
    element.classList.add('selected');

    citaData.fecha = document.getElementById('citaFecha').value;
    citaData.hora = slot.hora;

    // Remove datetime picker
    setTimeout(() => {
      const picker = container.querySelectorAll('.datetime-picker');
      picker.forEach(el => el.remove());

      // Check if we already have contact info
      if (citaData.nombre && citaData.telefono) {
        addBotMessage('Tengo los datos de tu última visita. ¿Quieres usar los mismos datos de contacto?');
        showQuickActions([
          { label: '✅ Sí, usar mismos datos', value: 'confirm_same_contact', primary: true },
          { label: '✏️ Cambiar datos', value: 'change_contact' },
        ]);
      } else {
        addBotMessage('Para confirmar tu cita, necesito algunos datos de contacto 📋\n\n¿Cuál es tu **nombre completo**?');
        input.focus();
        input.placeholder = 'Tu nombre completo';
        currentState = STATES.ASKING_CONTACT;
      }
    }, 400);
  }

  async function confirmAppointment() {
    setTyping(true);
    showQuickActions([]);

    try {
      const response = await fetch('/api/agendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...citaData,
          canal: 'chat',
        }),
      });

      const data = await response.json();
      setTyping(false);

      if (data.success) {
        addBotMessage(
          '🎉 **¡Cita agendada exitosamente!**\n\n' +
          `📅 **${formatDate(data.cita.fecha)}** a las **${data.cita.hora}**\n` +
          `🔧 ${data.cita.servicio}\n` +
          `🚗 Patente: ${data.cita.patente}\n\n` +
          'Recibirás una confirmación por **WhatsApp** 📱\n\n' +
          '¡Te esperamos! Gracias por confiar en **Global Pro Automotriz** 🏎️'
        );

        if (data.notificaciones) {
          if (!data.notificaciones.cliente) {
            addSystemMessage('⚠️ No se pudo enviar la notificación por WhatsApp. Te confirmaremos pronto.');
          }
        }

        currentState = STATES.COMPLETED;
        showQuickActions([
          { label: '📅 Agendar Otra Cita', value: 'agendar', primary: true },
          { label: '🔍 Consultar Vehículo', value: 'consultar' },
        ]);
      } else {
        addBotMessage('❌ Error: ' + (data.error || 'No se pudo agendar la cita'));
        showQuickActions([
          { label: '📅 Intentar de nuevo', value: 'agendar', primary: true },
        ]);
      }
    } catch (error) {
      setTyping(false);
      addBotMessage('❌ Error de conexión. Intenta de nuevo.');
      console.error('Agendar error:', error);
    }
  }

  function cancelAppointment() {
    const card = container.querySelectorAll('.confirm-card');
    card.forEach(el => el.remove());
    addBotMessage('No hay problema, la cita fue cancelada. ¿Quieres agendar para otro horario?');
    currentState = STATES.PICKING_DATETIME;
    showDateTimePicker();
  }

  // ─── Flow Controllers ───────────────────────────────────

  function startScheduling() {
    currentState = STATES.ASKING_PATENTE;
    citaData = {};

    if (currentPatente) {
      addBotMessage('¿Quieres usar la patente **' + currentPatente + '** que consultaste antes?');
      showQuickActions([
        { label: '✅ Sí, usar ' + currentPatente, value: 'use_current_patente', primary: true },
        { label: '✏️ Otra patente', value: 'new_patente' },
      ]);
    } else {
      addBotMessage('¡Vamos a agendar tu cita! 📅\n\nPrimero, ingresa la **patente** de tu vehículo:');
      showPatenteInput();
    }
  }

  // ─── Send Message (Free Text / LLM) ────────────────────

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isProcessing) return;

    addUserMessage(text);
    input.value = '';
    input.style.height = 'auto';
    setTyping(true);

    // Handle based on state
    if (currentState === STATES.ASKING_CONTACT) {
      handleContactInput(text);
      return;
    }

    // Free text - use LLM
    chatHistory.push({ role: 'user', content: text });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatHistory,
          patente: currentPatente || undefined,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let msgDiv = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const events = chunk.split('\n\n');

        for (const event of events) {
          const dataMatch = event.match(/data:\s*(.+)/);
          if (dataMatch) {
            try {
              const json = JSON.parse(dataMatch[1]);
              const token = json.response || (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) || '';
              fullResponse += token;

              if (!msgDiv) {
                setTyping(false);
                msgDiv = document.createElement('div');
                msgDiv.className = 'message message-bot';
                container.insertBefore(msgDiv, typing);
              }

              msgDiv.innerHTML = formatText(fullResponse);
              scrollToBottom();
            } catch (e) {
              // Skip malformed chunks
            }
          }
        }
      }

      setTyping(false);
      chatHistory.push({ role: 'assistant', content: fullResponse });

      // Check for CITA_JSON in response
      const citaMatch = fullResponse.match(/\[CITA_JSON\]([\s\S]*?)\[\/CITA_JSON\]/);
      if (citaMatch) {
        try {
          const citaJson = JSON.parse(citaMatch[1].trim());
          // Remove the JSON from displayed message
          if (msgDiv) {
            msgDiv.innerHTML = formatText(fullResponse.replace(/\[CITA_JSON\][\s\S]*?\[\/CITA_JSON\]/, '').trim());
          }
          // Auto-fill citaData and go to confirmation
          Object.assign(citaData, citaJson);
          showConfirmation();
          currentState = STATES.CONFIRMING;
        } catch (e) {
          console.error('Failed to parse CITA_JSON:', e);
        }
      }

      // Show quick actions after LLM response
      if (currentState === STATES.IDLE || currentState === STATES.COMPLETED) {
        showQuickActions([
          { label: '📅 Agendar Cita', value: 'agendar', primary: true },
          { label: '🔍 Consultar Vehículo', value: 'consultar' },
        ]);
      }
    } catch (error) {
      setTyping(false);
      addBotMessage('Disculpa, tuve un problema para procesar tu mensaje. Intenta de nuevo.');
      console.error('Chat error:', error);
    }
  }

  async function handleContactInput(text) {
    // First message in contact state is name
    if (!citaData.nombre) {
      citaData.nombre = text;
      addBotMessage('Gracias, **' + escapeHtml(text) + '**. ¿Cuál es tu **número de teléfono**? 📱');
      input.placeholder = 'Tu número de teléfono';
      input.focus();
    } else if (!citaData.telefono) {
      citaData.telefono = text;
      addBotMessage('¡Perfecto! Revisemos los datos de tu cita:');
      showConfirmation();
      currentState = STATES.CONFIRMING;
    }
  }

  // ─── Utilities ──────────────────────────────────────────

  function setTyping(show) {
    typing.classList.toggle('active', show);
    isProcessing = show;
    sendBtn.disabled = show;
  }

  function scrollToBottom() {
    container.scrollTop = container.scrollHeight;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getMinDate() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const d = new Date(dateStr + 'T12:00:00');
    return `${dias[d.getDay()]}, ${d.getDate()} de ${meses[d.getMonth()]} ${d.getFullYear()}`;
  }

  // ─── Expose sendMessage globally ───────────────────────
  window.sendMessage = sendMessage;

  // ─── Quick action handler with extended routing ─────────
  function handleQuickAction(value, label) {
    switch (value) {
      case 'agendar':
        startScheduling();
        break;
      case 'agendar_with_vehicle':
        startScheduling();
        break;
      case 'use_current_patente':
        handlePatenteSubmit(currentPatente);
        break;
      case 'new_patente':
        showPatenteInput();
        break;
      case 'confirm_same_contact':
        addBotMessage('Datos confirmados. Revisemos tu cita:');
        showConfirmation();
        currentState = STATES.CONFIRMING;
        break;
      case 'change_contact':
        delete citaData.nombre;
        delete citaData.telefono;
        addBotMessage('¿Cuál es tu **nombre completo**?');
        input.focus();
        input.placeholder = 'Tu nombre completo';
        currentState = STATES.ASKING_CONTACT;
        break;
      case 'consultar':
        showPatenteInput();
        break;
      case 'servicios':
        showServicesList();
        break;
      case 'contactar':
        addUserMessage('Contactar por WhatsApp');
        addBotMessage('📞 Puedes contactarnos directamente: **+56 9 3902 6185**');
        break;
      default:
        addUserMessage(label);
        break;
    }
  }

  // Override the global handleQuickAction
  const _origHandleQuickAction = handleQuickAction;
  window._handleQuickAction = _origHandleQuickAction;

  // ─── Start ──────────────────────────────────────────────
  init();

})();
