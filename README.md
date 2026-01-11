# Gestor de Tareas - Electron

Aplicación de escritorio desarrollada con Electron para gestionar tareas con prioridad opcional.

## Características

- ✅ Agregar y eliminar tareas
- 🎯 Prioridad opcional (Alta, Media, Baja, Sin prioridad)
- ✅ Marcar tareas como completadas
- 🔍 Filtrado por prioridad
- 💾 Persistencia de datos mediante archivo json en carpeta local de usuario
- 🎨 Interfaz moderna y atractiva
- 🧹 Limpiar tareas completadas
- Ver tareas eliminadas

## Instalación

1. Instala las dependencias:
```bash
npm install
```

## Uso

Para iniciar la aplicación:
```bash
npm start
```

Para modo desarrollo (con DevTools):
```bash
npm run dev
```

## Estructura del Proyecto

```
prueba/
├── main.js          # Proceso principal de Electron
├── index.html       # Interfaz de usuario
├── styles.css       # Estilos de la aplicación
├── renderer.js      # Lógica de la aplicación
├── package.json     # Configuración del proyecto
└── README.md        # Este archivo
```

## Tecnologías

- Electron 28.0.0
- HTML5
- CSS3
- JavaScript (ES6+)
