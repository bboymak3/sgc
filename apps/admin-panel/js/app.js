// ============================================
// SGC ADMIN - App principal (router)
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Sidebar navigation
  document.querySelectorAll('.sgc-nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.dataset.view;

      // Activar tab
      document.querySelectorAll('.sgc-nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      // Mostrar vista
      document.querySelectorAll('.sgc-view').forEach(v => v.style.display = 'none');
      const viewEl = document.getElementById(`view-${view}`);
      if (viewEl) viewEl.style.display = 'block';

      // Cargar datos
      switch (view) {
        case 'dashboard': loadDashboard(); break;
        case 'citas': loadCitas(); break;
        case 'calendario': loadCalendario(); break;
        case 'ordenes': loadOrdenes(); break;
        case 'tecnicos': loadTecnicos(); break;
      }
    });
  });
});
