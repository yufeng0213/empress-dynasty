/**
 * 月度活动记录：给“月度总结”用。
 * 只记玩家实际做过的事，不记系统自动结算。
 */

const getStateMonth = (state) => ({
  year: Number(state?.calendar?.year) || 1,
  month: Number(state?.calendar?.month) || 1,
})

export const ensureActivityFields = (state) => {
  if (!state) return state
  if (!Array.isArray(state.activityLog)) state.activityLog = []
  if (!('lastSummary' in state)) state.lastSummary = null
  return state
}

export const recordActivity = (state, text, type = 'action') => {
  if (!state || !text) return
  ensureActivityFields(state)
  const { year, month } = getStateMonth(state)
  state.activityLog.push({
    id: `act_${year}_${month}_${state.activityLog.length + 1}`,
    year,
    month,
    type,
    text: String(text).trim().slice(0, 120),
  })
  if (state.activityLog.length > 300) {
    state.activityLog = state.activityLog.slice(-300)
  }
}

export const getActivitiesForMonth = (state, year, month) => {
  const list = Array.isArray(state?.activityLog) ? state.activityLog : []
  return list
    .filter((item) => item.year === year && item.month === month)
    .slice(-8)
    .map((item) => ({ id: item.id, type: item.type, text: item.text }))
}
