import { api } from './api'

// Atalhos de sites de tecnologia (espelho da TechLinksView do PySide:
// config.json -> settings.tech_links).
export const getTechLinks = () => api.get('/tech-links').then((r) => r.data)
export const saveTechLinks = (links) => api.put('/tech-links', { links }).then((r) => r.data)
