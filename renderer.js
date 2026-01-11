// Clase para gestionar las tareas
class TaskManager {
    constructor() {
        this.tasks = [];
        this.deletedTasks = [];
        this.currentFilter = 'all';
        this.showingDeleted = false;
        this.initEventListeners();
        this.loadTasks();
    }

    async loadTasks() {
        try {
            // Migrar desde localStorage si existe
            const localTasks = localStorage.getItem('tasks');
            if (localTasks) {
                const tasks = JSON.parse(localTasks);
                if (tasks.length > 0) {
                    // Si hay tareas en localStorage, migrarlas al archivo JSON
                    this.tasks = tasks;
                    await this.saveTasks();
                    // Limpiar localStorage después de migrar
                    localStorage.removeItem('tasks');
                }
            }
            
            // Cargar desde archivo JSON
            if (this.tasks.length === 0 && typeof require !== 'undefined') {
                const { ipcRenderer } = require('electron');
                const data = await ipcRenderer.invoke('load-tasks');
                // El archivo JSON puede tener un objeto con tasks y deletedTasks
                if (Array.isArray(data)) {
                    // Formato antiguo: solo un array de tareas
                    this.tasks = data;
                    this.deletedTasks = [];
                } else if (data && typeof data === 'object') {
                    // Formato nuevo: objeto con tasks y deletedTasks
                    this.tasks = data.tasks || [];
                    this.deletedTasks = data.deletedTasks || [];
                }
            } else if (this.tasks.length === 0) {
                // Fallback si no estamos en Electron
                this.tasks = [];
                this.deletedTasks = [];
            }

            // Asegurar que ninguna tarea esté en modo edición al cargar
            this.tasks.forEach(t => {
                t.editing = false;
                // Agregar createdAt si no existe (para tareas antiguas)
                if (!t.createdAt) {
                    t.createdAt = new Date().toISOString();
                }
            });

            // Guardar las tareas actualizadas si se agregó createdAt
            if (this.tasks.some(t => !t.createdAt)) {
                await this.saveTasks();
            }

            this.renderTasks();
        } catch (error) {
            console.error('Error al cargar tareas:', error);
            this.tasks = [];
            this.renderTasks();
        }
    }

    initEventListeners() {
        const addBtn = document.getElementById('addTaskBtn');
        const taskInput = document.getElementById('taskInput');
        const clearBtn = document.getElementById('clearCompletedBtn');
        const filterSelect = document.getElementById('filterSelect');
        const viewDeletedBtn = document.getElementById('viewDeletedBtn');
        const closeDeletedBtn = document.getElementById('closeDeletedBtn');

        addBtn.addEventListener('click', () => this.addTask());
        taskInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addTask();
            }
        });

        clearBtn.addEventListener('click', () => this.clearCompleted());
        viewDeletedBtn.addEventListener('click', () => this.showDeletedTasks());
        closeDeletedBtn.addEventListener('click', () => this.hideDeletedTasks());

        filterSelect.addEventListener('change', (e) => {
            this.currentFilter = e.target.value;
            this.renderTasks();
        });
    }

    async addTask() {
        const taskInput = document.getElementById('taskInput');
        const prioritySelect = document.getElementById('prioritySelect');
        const dueDateInput = document.getElementById('dueDateInput');
        
        const text = taskInput.value.trim();
        if (!text) {
            return;
        }

        let dueDate = null;
        if (dueDateInput.value) {
            // Convertir datetime-local a ISO string
            dueDate = new Date(dueDateInput.value).toISOString();
        }

        const task = {
            id: Date.now(),
            text: text,
            completed: false,
            priority: prioritySelect.value || null,
            createdAt: new Date().toISOString(),
            dueDate: dueDate
        };

        this.tasks.push(task);
        taskInput.value = '';
        prioritySelect.value = '';
        dueDateInput.value = '';
        
        await this.saveTasks();
        this.renderTasks();
        
        // Animación de entrada
        taskInput.focus();
    }

    async toggleTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            await this.saveTasks();
            this.renderTasks();
        }
    }

    async deleteTask(id) {
        if (confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
            const task = this.tasks.find(t => t.id === id);
            if (task) {
                // Agregar fecha de eliminación
                task.deletedAt = new Date().toISOString();
                // Mover a la lista de eliminadas
                this.deletedTasks.push(task);
                // Remover de la lista activa
                this.tasks = this.tasks.filter(t => t.id !== id);
                await this.saveTasks();
                this.renderTasks();
            }
        }
    }

    async restoreTask(id) {
        const task = this.deletedTasks.find(t => t.id === id);
        if (task) {
            // Remover fecha de eliminación
            delete task.deletedAt;
            // Mover de vuelta a la lista activa
            this.tasks.push(task);
            // Remover de la lista de eliminadas
            this.deletedTasks = this.deletedTasks.filter(t => t.id !== id);
            await this.saveTasks();
            this.renderDeletedTasks();
            this.renderTasks();
        }
    }

    async permanentlyDeleteTask(id) {
        if (confirm('¿Estás seguro de que quieres eliminar permanentemente esta tarea? Esta acción no se puede deshacer.')) {
            this.deletedTasks = this.deletedTasks.filter(t => t.id !== id);
            await this.saveTasks();
            this.renderDeletedTasks();
        }
    }

    showDeletedTasks() {
        this.showingDeleted = true;
        const section = document.getElementById('deletedTasksSection');
        section.style.display = 'block';
        this.renderDeletedTasks();
    }

    hideDeletedTasks() {
        this.showingDeleted = false;
        const section = document.getElementById('deletedTasksSection');
        section.style.display = 'none';
    }

    startEditingTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task || task.editing) {
            return;
        }

        // Marcar todas las tareas como no editables
        this.tasks.forEach(t => t.editing = false);
        task.editing = true;
        this.renderTasks();

        // Enfocar el campo de entrada después de que se renderice
        setTimeout(() => {
            const editInput = document.querySelector(`.task-edit-input[data-task-id="${id}"]`);
            if (editInput) {
                editInput.focus();
                editInput.select();
            }
        }, 0);
    }

    async saveTaskEdit(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) {
            return;
        }

        const editInput = document.querySelector(`.task-edit-input[data-task-id="${id}"]`);
        const prioritySelect = document.querySelector(`.task-edit-priority[data-task-id="${id}"]`);
        const dueDateInput = document.querySelector(`.task-edit-due-date[data-task-id="${id}"]`);
        
        if (editInput) {
            const newText = editInput.value.trim();
            let hasChanges = false;
            
            if (newText && newText !== task.text) {
                task.text = newText;
                hasChanges = true;
            }
            
            if (prioritySelect) {
                const newPriority = prioritySelect.value || null;
                if (newPriority !== task.priority) {
                    task.priority = newPriority;
                    hasChanges = true;
                }
            }

            if (dueDateInput) {
                let newDueDate = null;
                if (dueDateInput.value) {
                    newDueDate = new Date(dueDateInput.value).toISOString();
                }
                const currentDueDate = task.dueDate || null;
                if (newDueDate !== currentDueDate) {
                    task.dueDate = newDueDate;
                    hasChanges = true;
                }
            }
            
            if (hasChanges) {
                await this.saveTasks();
            }
            
            task.editing = false;
            this.renderTasks();
        }
    }

    async changePriority(id, newPriority) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.priority = newPriority || null;
            await this.saveTasks();
            this.renderTasks();
        }
    }

    showPriorityMenu(taskId, element) {
        // Eliminar menú existente si hay uno
        const existingMenu = document.querySelector('.priority-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        const menu = document.createElement('div');
        menu.className = 'priority-menu';
        menu.innerHTML = `
            <div class="priority-menu-item" data-priority="">Sin prioridad</div>
            <div class="priority-menu-item" data-priority="low">Baja</div>
            <div class="priority-menu-item" data-priority="medium">Media</div>
            <div class="priority-menu-item" data-priority="high">Alta</div>
        `;

        const rect = element.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left}px`;
        menu.style.zIndex = '1000';

        menu.querySelectorAll('.priority-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const priority = item.dataset.priority || null;
                this.changePriority(taskId, priority);
                menu.remove();
            });
        });

        // Cerrar menú al hacer clic fuera
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && e.target !== element) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };

        document.body.appendChild(menu);
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 0);
    }

    cancelTaskEdit(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.editing = false;
            this.renderTasks();
        }
    }

    async clearCompleted() {
        const completedCount = this.tasks.filter(t => t.completed).length;
        if (completedCount === 0) {
            alert('No hay tareas completadas para eliminar.');
            return;
        }

        if (confirm(`¿Eliminar ${completedCount} tarea(s) completada(s)?`)) {
            this.tasks = this.tasks.filter(t => !t.completed);
            await this.saveTasks();
            this.renderTasks();
        }
    }

    getFilteredTasks() {
        if (this.currentFilter === 'all') {
            return this.tasks;
        }
        
        if (this.currentFilter === 'none') {
            return this.tasks.filter(t => !t.priority || t.priority === '');
        }

        return this.tasks.filter(t => t.priority === this.currentFilter);
    }

    renderTasks() {
        const tasksList = document.getElementById('tasksList');
        const emptyState = document.getElementById('emptyState');
        const taskCount = document.getElementById('taskCount');
        
        const filteredTasks = this.getFilteredTasks();
        const totalTasks = this.tasks.length;
        const activeTasks = this.tasks.filter(t => !t.completed).length;

        taskCount.textContent = `${activeTasks} de ${totalTasks} tareas`;
        
        // Actualizar el texto del botón de ver eliminadas
        const viewDeletedBtn = document.getElementById('viewDeletedBtn');
        if (viewDeletedBtn) {
            if (this.deletedTasks.length > 0) {
                viewDeletedBtn.textContent = `Ver eliminadas (${this.deletedTasks.length})`;
            } else {
                viewDeletedBtn.textContent = 'Ver eliminadas';
            }
        }

        tasksList.innerHTML = '';

        if (filteredTasks.length === 0) {
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        filteredTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item ${task.completed ? 'completed' : ''} ${task.priority ? 'priority-' + task.priority : ''} ${task.editing ? 'editing' : ''}`;
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'task-checkbox';
            checkbox.checked = task.completed;
            checkbox.disabled = task.editing;
            checkbox.addEventListener('change', () => this.toggleTask(task.id));

            // Si está en modo edición, mostrar campo de entrada
            if (task.editing) {
                const editInput = document.createElement('input');
                editInput.type = 'text';
                editInput.className = 'task-edit-input';
                editInput.value = task.text;
                editInput.setAttribute('data-task-id', task.id);
                editInput.addEventListener('blur', () => this.saveTaskEdit(task.id));
                editInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        this.saveTaskEdit(task.id);
                    } else if (e.key === 'Escape') {
                        this.cancelTaskEdit(task.id);
                    }
                });

                const prioritySelect = document.createElement('select');
                prioritySelect.className = 'task-edit-priority';
                prioritySelect.setAttribute('data-task-id', task.id);
                prioritySelect.innerHTML = `
                    <option value="" ${!task.priority ? 'selected' : ''}>Sin prioridad</option>
                    <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Baja</option>
                    <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Media</option>
                    <option value="high" ${task.priority === 'high' ? 'selected' : ''}>Alta</option>
                `;

                const dueDateInput = document.createElement('input');
                dueDateInput.type = 'datetime-local';
                dueDateInput.className = 'task-edit-due-date';
                dueDateInput.setAttribute('data-task-id', task.id);
                if (task.dueDate) {
                    // Convertir ISO string a formato datetime-local (YYYY-MM-DDTHH:mm)
                    const dueDate = new Date(task.dueDate);
                    const year = dueDate.getFullYear();
                    const month = String(dueDate.getMonth() + 1).padStart(2, '0');
                    const day = String(dueDate.getDate()).padStart(2, '0');
                    const hours = String(dueDate.getHours()).padStart(2, '0');
                    const minutes = String(dueDate.getMinutes()).padStart(2, '0');
                    dueDateInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
                }
                dueDateInput.title = 'Fecha de terminación (opcional)';

                const saveBtn = document.createElement('button');
                saveBtn.className = 'edit-btn save-btn';
                saveBtn.textContent = '✓';
                saveBtn.title = 'Guardar';
                saveBtn.addEventListener('click', () => this.saveTaskEdit(task.id));

                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'edit-btn cancel-btn';
                cancelBtn.textContent = '✕';
                cancelBtn.title = 'Cancelar';
                cancelBtn.addEventListener('click', () => this.cancelTaskEdit(task.id));

                li.appendChild(checkbox);
                li.appendChild(editInput);
                li.appendChild(prioritySelect);
                li.appendChild(dueDateInput);
                li.appendChild(saveBtn);
                li.appendChild(cancelBtn);
            } else {
                // Modo normal: mostrar texto con posibilidad de editar
                const textContainer = document.createElement('div');
                textContainer.className = 'task-text-container';

                const text = document.createElement('span');
                text.className = 'task-text';
                text.textContent = task.text;
                text.title = 'Doble clic para editar';
                text.addEventListener('dblclick', () => this.startEditingTask(task.id));

                const dateInfo = document.createElement('span');
                dateInfo.className = 'task-date';
                const formattedDate = this.formatDate(task.createdAt);
                dateInfo.textContent = `Creada: ${formattedDate}`;
                dateInfo.title = task.createdAt ? new Date(task.createdAt).toLocaleString('es-ES') : '';

                textContainer.appendChild(text);
                textContainer.appendChild(dateInfo);

                // Agregar fecha de terminación si existe
                if (task.dueDate) {
                    const dueDateInfo = document.createElement('span');
                    dueDateInfo.className = 'task-due-date';
                    const dueDate = new Date(task.dueDate);
                    const now = new Date();
                    const isOverdue = !task.completed && dueDate < now;
                    
                    if (isOverdue) {
                        dueDateInfo.classList.add('overdue');
                    } else if (dueDate.getDate() === now.getDate() && 
                               dueDate.getMonth() === now.getMonth() && 
                               dueDate.getFullYear() === now.getFullYear()) {
                        dueDateInfo.classList.add('due-today');
                    }
                    
                    dueDateInfo.textContent = `Vence: ${this.formatDueDate(task.dueDate)}`;
                    dueDateInfo.title = `Fecha de terminación: ${new Date(task.dueDate).toLocaleString('es-ES')}`;
                    textContainer.appendChild(dueDateInfo);
                }

                const editBtn = document.createElement('button');
                editBtn.className = 'edit-btn';
                editBtn.textContent = '✎';
                editBtn.title = 'Editar';
                editBtn.addEventListener('click', () => this.startEditingTask(task.id));

                const priorityBadge = document.createElement('span');
                priorityBadge.className = `task-priority ${task.priority || 'none'}`;
                
                const priorityLabels = {
                    'high': 'Alta',
                    'medium': 'Media',
                    'low': 'Baja'
                };
                
                if (task.priority) {
                    priorityBadge.textContent = priorityLabels[task.priority] || task.priority;
                } else {
                    priorityBadge.textContent = 'Sin prioridad';
                    priorityBadge.classList.add('no-priority');
                }
                
                priorityBadge.title = 'Clic para cambiar prioridad';
                priorityBadge.style.cursor = 'pointer';
                priorityBadge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showPriorityMenu(task.id, priorityBadge);
                });

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.textContent = 'Eliminar';
                deleteBtn.addEventListener('click', () => this.deleteTask(task.id));

                li.appendChild(checkbox);
                li.appendChild(textContainer);
                li.appendChild(priorityBadge);
                li.appendChild(editBtn);
                li.appendChild(deleteBtn);
            }

            tasksList.appendChild(li);
        });
    }

    renderDeletedTasks() {
        const deletedTasksList = document.getElementById('deletedTasksList');
        const emptyDeletedState = document.getElementById('emptyDeletedState');
        
        deletedTasksList.innerHTML = '';

        if (this.deletedTasks.length === 0) {
            emptyDeletedState.style.display = 'block';
            return;
        }

        emptyDeletedState.style.display = 'none';

        // Ordenar por fecha de eliminación (más recientes primero)
        const sortedDeleted = [...this.deletedTasks].sort((a, b) => {
            const dateA = new Date(a.deletedAt || 0);
            const dateB = new Date(b.deletedAt || 0);
            return dateB - dateA;
        });

        sortedDeleted.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item deleted ${task.priority ? 'priority-' + task.priority : ''}`;
            
            const textContainer = document.createElement('div');
            textContainer.className = 'task-text-container';

            const text = document.createElement('span');
            text.className = 'task-text';
            text.textContent = task.text;
            text.style.textDecoration = 'line-through';
            text.style.opacity = '0.7';

            const dateInfo = document.createElement('span');
            dateInfo.className = 'task-date';
            const formattedDate = this.formatDate(task.createdAt);
            dateInfo.textContent = `Creada: ${formattedDate}`;

            const deletedDateInfo = document.createElement('span');
            deletedDateInfo.className = 'task-date deleted-date';
            if (task.deletedAt) {
                deletedDateInfo.textContent = `Eliminada: ${this.formatDate(task.deletedAt)}`;
            }

            textContainer.appendChild(text);
            textContainer.appendChild(dateInfo);
            textContainer.appendChild(deletedDateInfo);

            const priorityBadge = document.createElement('span');
            priorityBadge.className = `task-priority ${task.priority || 'none'}`;
            
            const priorityLabels = {
                'high': 'Alta',
                'medium': 'Media',
                'low': 'Baja'
            };
            
            if (task.priority) {
                priorityBadge.textContent = priorityLabels[task.priority] || task.priority;
            } else {
                priorityBadge.textContent = 'Sin prioridad';
                priorityBadge.classList.add('no-priority');
            }

            const restoreBtn = document.createElement('button');
            restoreBtn.className = 'edit-btn restore-btn';
            restoreBtn.textContent = '↩';
            restoreBtn.title = 'Restaurar';
            restoreBtn.addEventListener('click', () => this.restoreTask(task.id));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = 'Eliminar permanentemente';
            deleteBtn.addEventListener('click', () => this.permanentlyDeleteTask(task.id));

            li.appendChild(textContainer);
            li.appendChild(priorityBadge);
            li.appendChild(restoreBtn);
            li.appendChild(deleteBtn);

            deletedTasksList.appendChild(li);
        });
    }

    async saveTasks() {
        try {
            if (typeof require !== 'undefined') {
                const { ipcRenderer } = require('electron');
                // Guardar tanto tasks como deletedTasks
                await ipcRenderer.invoke('save-tasks', {
                    tasks: this.tasks,
                    deletedTasks: this.deletedTasks
                });
            } else {
                // Fallback a localStorage si no estamos en Electron
                localStorage.setItem('tasks', JSON.stringify(this.tasks));
                localStorage.setItem('deletedTasks', JSON.stringify(this.deletedTasks));
            }
        } catch (error) {
            console.error('Error al guardar tareas:', error);
        }
    }

    formatDate(dateString) {
        if (!dateString) {
            return '';
        }

        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            // Formato corto para fechas recientes
            if (diffDays === 0) {
                // Hoy: mostrar solo la hora
                return date.toLocaleTimeString('es-ES', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
            } else if (diffDays === 1) {
                // Ayer
                return `Ayer ${date.toLocaleTimeString('es-ES', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                })}`;
            } else if (diffDays < 7) {
                // Esta semana: día de la semana + hora
                return date.toLocaleDateString('es-ES', { 
                    weekday: 'short',
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
            } else {
                // Más antigua: fecha completa
                return date.toLocaleString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        } catch (error) {
            return '';
        }
    }

    formatDueDate(dateString) {
        if (!dateString) {
            return '';
        }

        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffTime = date - now;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            const diffHours = Math.floor(diffTime / (1000 * 60 * 60));

            // Formato específico para fechas de terminación
            if (diffDays < 0) {
                // Vencida
                if (diffDays === -1) {
                    return `Ayer ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
                } else {
                    return date.toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            } else if (diffDays === 0) {
                // Hoy
                if (diffHours < 0) {
                    return `Hoy ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} (vencida)`;
                } else if (diffHours === 0) {
                    return `Hoy ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
                } else {
                    return `Hoy ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} (en ${diffHours}h)`;
                }
            } else if (diffDays === 1) {
                return `Mañana ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
            } else if (diffDays < 7) {
                return `${date.toLocaleDateString('es-ES', { weekday: 'short' })} ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} (en ${diffDays}d)`;
            } else {
                return date.toLocaleString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        } catch (error) {
            return '';
        }
    }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new TaskManager();
});
