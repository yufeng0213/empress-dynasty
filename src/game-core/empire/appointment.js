/**
 * 补缺：有人死了，官位空出来，需要重新择人
 */

import { createRng } from './random.js'
import { generateOfficialCharacter } from './characters.js'
import { recordActivity } from './activity.js'

export const APPOINT_COST = 200
const CANDIDATE_COUNT = 3

const getMonthIndex = (state) => (
  ((Number(state?.calendar?.year) || 1) - 1) * 12 + (Number(state?.calendar?.month) || 1)
)

const clone = (value) => JSON.parse(JSON.stringify(value))

export const ensureAppointmentFields = (state) => {
  if (!state) return state
  if (!Array.isArray(state.vacancies)) state.vacancies = []
  if (!('appointment' in state)) state.appointment = null
  return state
}

const restoreExamCandidates = (state) => {
  const current = state.appointment?.candidates || []
  const examCandidates = current.filter((item) => item.source === 'exam' || item.source === 'recommend')
  if (examCandidates.length > 0) {
    state.examPool = [...(state.examPool || []), ...examCandidates].slice(-9)
  }
  state.appointment = null
}

export const startAppointment = (state, vacancyIndex, options = {}) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法补缺' }
  }
  ensureAppointmentFields(state)
  const vacancy = state.vacancies[vacancyIndex]
  if (!vacancy) {
    return { success: false, state, message: '这个缺位已经补上了' }
  }

  const next = clone(state)
  restoreExamCandidates(next)
  const rng = createRng(Number(options.seed) || (Date.now() + vacancyIndex * 131))
  const usedNames = new Set((next.characters || []).map((item) => item.name))

  // 新科进士优先补缺
  const pool = Array.isArray(next.examPool) ? next.examPool.slice(0, CANDIDATE_COUNT - 1) : []
  next.examPool = (next.examPool || []).filter((item) => !pool.some((picked) => picked.id === item.id))

  const generatedCount = Math.max(0, CANDIDATE_COUNT - pool.length)
  const generated = Array.from({ length: generatedCount }, (_, index) => generateOfficialCharacter(rng, {
    role: vacancy.role,
    office: vacancy.office,
    faction: vacancy.faction,
    factionName: vacancy.factionName,
    region: vacancy.region || '',
    regionName: vacancy.regionName || '',
    postType: vacancy.postType || 'central',
    id: `dyn_appoint_${getMonthIndex(next)}_${vacancyIndex}_${index + 1}_${Math.floor(rng() * 99999)}`,
    usedNames,
  }))

  const candidates = [...pool, ...generated]

  next.appointment = {
    vacancyIndex,
    vacancyOffice: vacancy.office,
    vacancyRegion: vacancy.regionName || '',
    candidates,
  }

  return { success: true, state: next, message: `为${vacancy.office}择人` }
}

export const appointOfficial = (state, candidateId) => {
  if (!state || state.status !== 'playing') {
    return { success: false, state, message: '当前无法补缺' }
  }
  const appointment = state.appointment
  if (!appointment) {
    return { success: false, state, message: '没有待补的缺位' }
  }
  const candidate = (appointment.candidates || []).find((item) => item.id === candidateId)
  if (!candidate) {
    return { success: false, state, message: '候选人不存在' }
  }
  if ((Number(state.resources?.treasury) || 0) < APPOINT_COST) {
    return { success: false, state, message: `国库不足 ${APPOINT_COST} 贯` }
  }

  const next = clone(state)
  const vacancy = next.vacancies[appointment.vacancyIndex]
  if (!vacancy) {
    return { success: false, state, message: '这个缺位已经补上了' }
  }

  const newCharacter = {
    ...candidate,
    office: vacancy.office,
    role: vacancy.role,
    region: vacancy.region || '',
    regionName: vacancy.regionName || '',
    postType: vacancy.postType || 'central',
    rank: candidate.source === 'exam' ? 6 : (Number(candidate.rank) || 5),
    source: candidate.source === 'exam' ? 'exam' : 'appointment',
    bioPending: true,
  }
  next.characters.push(newCharacter)

  // 地方官补缺后要把地区的 governorId 指过去
  if (vacancy.region) {
    const region = (next.regions || []).find((item) => item.id === vacancy.region)
    if (region) region.governorId = newCharacter.id
  }

  // 同年互援，座师得利
  if (Number(newCharacter.examCohort) > 0) {
    for (const item of next.characters || []) {
      if (item.alive !== false && item.id !== newCharacter.id && item.examCohort === newCharacter.examCohort) {
        item.loyalty = Math.min(100, (Number(item.loyalty) || 0) + 2)
      }
    }
    const master = (next.characters || []).find((item) => (
      item.id === newCharacter.examMasterId && item.alive !== false
    ))
    if (master) {
      master.loyalty = Math.min(100, (Number(master.loyalty) || 0) + 3)
    }
  }
  next.vacancies.splice(appointment.vacancyIndex, 1)
  next.resources.treasury = Math.round((Number(next.resources.treasury) || 0) - APPOINT_COST)
  next.appointment = null
  recordActivity(next, `任命${candidate.name}为${vacancy.office}（-${APPOINT_COST}贯）`, 'appoint')
  next.updatedAt = Date.now()

  return { success: true, state: next, message: `${candidate.name}补${vacancy.office}` }
}

export const cancelAppointment = (state) => {
  const next = clone(state)
  restoreExamCandidates(next)
  return { success: true, state: next }
}
