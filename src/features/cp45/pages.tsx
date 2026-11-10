/* Praise Kier */
import { lazy } from 'react'
export const Refiners = lazy(() => import('../refiners/pages/RefinersPage'))
export const Detail = lazy(() => import('../refiners/pages/RefinerDetailPage'))
export const Edit = lazy(() => import('../refiners/pages/RefinerEditPage'))
export const Badge = lazy(() => import('../refiners/pages/BadgeEditorPage'))
export const Incidents = lazy(() => import('../incidents/pages/IncidentsPage'))
export const NewIncident = lazy(() => import('../incidents/pages/NewIncidentPage'))
