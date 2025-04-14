import { Octokit } from "@octokit/core"
import ora from 'ora'
import type { ContributorsInfo, ContributorsInfoMap } from './types'

/**
 * Traverse all pages for data collection, and break when breakOn returns true.
 *
 * @param requestByPage Request function by page.
 * @param breakOn Break condition function.
 * @returns Data collection.
 */
async function traversePagesForCount(
  requestByPage: (page: number) => Promise<any>,
  breakOn?: (resp: any) => boolean,
) {
  let page = 1;
  const dataCollection: any[] = [];
  while (true) {
    const resp = await requestByPage(page);
    if (resp.data.length === 0) {
      break;
    }
    if (breakOn?.(resp)) {
      dataCollection.push(...resp.data)
      break;
    }
    page++
    dataCollection.push(...resp.data)
  }

  return dataCollection
}

/**
 * Fetch repo create time.
 *
 * @param octokit Octokit instance.
 * @param owner Owner of the repo.
 * @param repo Repo name.
 * @returns Repo create time.
 * @throws Error when fetching repo create time failed.
 * @example
 * const octokit = new Octokit({ auth: 'YOUR_TOKEN' })
 * const repoCreateTime = await getRepoCreateTime(octokit, 'octokit', 'rest.js')
 * console.log(repoCreateTime) // 2021-01-01T00:00:00.000Z
 */
async function getRepoCreateTime(octokit: Octokit, owner: string, repo: string) {
  try {
    const repoData = await octokit.request(
      'GET /repos/{owner}/{repo}',
      {
        owner,
        repo,
      }
    )
    return new Date(repoData.data.created_at)
  } catch (e) {
    console.error(`Fetch repo create time error: ${e}`)
    throw e
  }
}

/**
 * Fetch repos info from GitHub API.
 *
 * @param params Fetch repos info params.
 * @returns Repos info.
 */
export async function fetchRepos(params: {
  token: string,
  owner: string,
}) {
  const { token, owner } = params
  const octokit = new Octokit({ auth: token })
  const reposData: any[] = []
  const loadingSpin = ora(`Fetching ${owner} repos...`).start()

  // fetch repos infos
  try {
    const reposRespData = await traversePagesForCount(
      (page) => octokit.request(
        'GET /orgs/{owner}/repos{?type,page,per_page}',
        {
          owner,
          type: 'public',
          page,
          per_page: '100',
        }
      )
    )
    reposData.push(...reposRespData)
    loadingSpin.succeed(`Fetching ${owner} repos done`)
    // "full_name": "octocat/Hello-World"
    return reposData.map(repo => ({ owner, repo: repo.full_name.split('/')[1] }))
  } catch (err) {
    console.log(`Error: Fetching ${owner} repos failed! ${err}`)
  }
}

/**
 * Fetch contributors info from GitHub API.
 *
 * @param params Fetch contributors info params.
 * @returns Contributors info map.
 */
export async function fetchContributorsInfo(params: {
  token: string,
  owner: string,
  repo: string,
}) {
  const { token, owner, repo } = params
  const octokit = new Octokit({ auth: token })
  const contributorsData: any[] = []
  const loadingSpin = ora(`Fetching ${owner}/${repo} contributors...`).start()

  // fetch contributors infos
  try {
    const contributorsRespData = await traversePagesForCount(
      (page) => octokit.request(
        'GET /repos/{owner}/{repo}/contributors{?anon,page,per_page}',
        {
          owner,
          repo,
          anon: true,
          page,
          per_page: '100',
        }
      ),
    )
    contributorsData.push(...contributorsRespData)
    loadingSpin.succeed(`Fetching ${owner}/${repo} contributors done`)
  } catch (err) {
    console.log(`Error: Fetching ${owner}/${repo} contributors failed! ${err}`)
  }

  // create a map for all contributors infos
  const allContributorsInfos = new Map<string, ContributorsInfo>()
  contributorsData.forEach(contributor => {
    const [userName, avatarURL] = [contributor.login, contributor.avatar_url]
    const userInfoByName = allContributorsInfos.get(userName)
    if (!userInfoByName) {
      allContributorsInfos.set(userName, {
        avatarURL,
        commitURLs: [],
      })
    }
  })

  // count commits for all contributors we got in the map now
  await supplementContributorsCommits({
    token,
    repo,
    owner,
    contributorsMap: allContributorsInfos
  })

  return allContributorsInfos
}

/**
 * Supplement contributors commits info to contributors map.
 *
 * @param params Supplement contributors commits info params.
 * @returns void.
 */
export async function supplementContributorsCommits(params: {
  token: string,
  owner: string,
  repo: string,
  contributorsMap: ContributorsInfoMap,
}) {
  const { token, owner, repo, contributorsMap } = params
  const octokit = new Octokit({ auth: token })
  const commitsData: any[] = []

  const repoCreateTime = await getRepoCreateTime(
    octokit,
    owner,
    repo
  );

  const loadingSpin = ora(`Fetching ${owner}/${repo} commits...`).start()
  try {
    const commitsRespData = await traversePagesForCount(
      (page) => octokit.request(
        'GET /repos/{owner}/{repo}/commits{?page,per_page,since}',
        {
          owner,
          repo,
          page,
          per_page: '100',
        }
      ),
      (resp) => {
        const commits = resp.data
        if (commits.some((commit: any) => {
          const { commit: { author: { date } } } = commit
          return new Date(date).getTime() < repoCreateTime.getTime()
        })) {
          return true
        }

        return false
      }
    )
    commitsData.push(...commitsRespData
      .filter((commit: any) => Boolean(commit?.author?.login))
      .map((commit: any) => {
        const { author: { login: userName }, commit: { author: { date }, url } } = commit
        return { userName, url, date }
      })
    )
    loadingSpin.succeed(`Fetching ${owner}/${repo} commits done`)
  } catch (err) {
    console.log(`Error: Fetching ${owner}/${repo} contributors commits failed! ${err}`)
  }

  loadingSpin.start('Supplementing commits info to contributors map...')
  commitsData
    .filter(
      commit => new Date(commit.date).getTime() > repoCreateTime.getTime()
    )
    .forEach(commitInfo => {
    const { userName, url } = commitInfo
    const foundUserInfoByName = contributorsMap.get(userName)
    if (!foundUserInfoByName) {
      return
    }

    const userInfoByName = contributorsMap.get(userName)!
    if (!userInfoByName.commitURLs) {
      userInfoByName.commitURLs = []
    }
    userInfoByName.commitURLs.push(url)
  })
  loadingSpin.succeed('Supplementing commits done')
}
