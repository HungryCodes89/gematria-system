import { NBA_TEAMS, findNBATeam } from './teams-nba'
import { NHL_TEAMS, findNHLTeam } from './teams-nhl'
import { MLB_TEAMS, findMLBTeam } from './teams-mlb'
import type { TeamInfo } from './teams-nba'

export { NBA_TEAMS, NHL_TEAMS, MLB_TEAMS, findNBATeam, findNHLTeam, findMLBTeam }
export type { TeamInfo }

export const ALL_TEAMS = [...NBA_TEAMS, ...NHL_TEAMS, ...MLB_TEAMS]

export function findTeam(query: string, league?: 'NBA' | 'NHL' | 'MLB'): TeamInfo | undefined {
  if (league === 'NBA') return findNBATeam(query)
  if (league === 'NHL') return findNHLTeam(query)
  if (league === 'MLB') return findMLBTeam(query)
  return findNBATeam(query) || findNHLTeam(query) || findMLBTeam(query)
}

export function getTeamNameVariations(team: TeamInfo): string[] {
  const names = [
    team.fullName,
    team.city,
    team.teamName,
    team.abbreviation,
    `${team.city} ${team.teamName}`,
  ]
  if (team.alternateNames) names.push(...team.alternateNames)

  const venueParts = team.venue.split(' ')
  names.push(team.venue)
  if (venueParts.length > 1) {
    names.push(...venueParts.filter(p => p.length > 2))
  }

  return [...new Set(names)]
}
