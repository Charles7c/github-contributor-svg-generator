import { program } from 'commander'
import { fetchRepos, fetchContributorsInfo } from './fetch'
import { checkContribsPersistence, saveContribsPersistence } from './persistence'
import { saveSVG as saveSVG } from './save-svg'
import { generateContributorsSVGFile } from './svg-codegen'
import { getRepoName } from './utils'
import type { CliOptions, RepoInfo, ContributorsInfo } from './types'


async function main() {
  // const { Github_token: defaultToken, Github_owner: defaultOwner } = process.env
  // const defaultRepoName = await getRepoName()
  const GITHUBReg = /https:\/\/github.com\/([\w\-_]+)\/([\w\-_]+)/
  let urlInfo = null
  program
    .name('gh-contrib-svg')
    .arguments('[url]')
    .option('-t, --token <token>', 'Personal GitHub token')
    .option('-o, --owner <owner>', 'Repo owner name')
    .option('-r, --repo <repo>', 'GitHub repo path')
    .option('-e, --exclude <exclude>', 'Exclude gitHub repo path')
    .option('-s, --size <size>', 'Single avatar block size (pixel)', "120")
    .option('-w, --width <width>', 'Output image width (pixel)', "1000")
    .option('-c, --count <count>', 'Avatar count in one line', "8")
    .action((url) => {
      if (!url) return
      const match = url.match(GITHUBReg)
      if (!match)
        throw new Error('Invalid GitHub Repo URL')
      const [_, owner, repo] = match
      urlInfo = {
        owner,
        repo
      }
    })
    .parse(process.argv)
  const options = Object.assign(program.opts(), urlInfo)
  const { token, repo, owner, exclude, size: avatarBlockSize, width, count: lineCount } = options as CliOptions

  if (token && owner) {
    let repos: RepoInfo[] = []
    let identifier = 'contributor_'
    if (repo) {
      // fetch <owner>/<repo> contributors info
      identifier += repo;
      repos.push({ owner, repo })
    } else {
      // fetch <owner> contributors info
      identifier += owner;
      const ownerRepos = await fetchRepos({ token, owner })
      if (!ownerRepos || ownerRepos.length === 0) {
        throw new Error('No repos found')
      }
      repos = [...repos, ...ownerRepos]
    }
    const startTime = performance.now()
    const allContributorsInfos = new Map<string, ContributorsInfo>()
    for (const { owner, repo } of repos) {
      if (exclude && repo === exclude) {
        continue
      }
      const contributorsInfos = await fetchContributorsInfo({ token, repo, owner });
      contributorsInfos.forEach((info, username) => {
        const userInfoByName = allContributorsInfos.get(username)
        if (!userInfoByName) {
          allContributorsInfos.set(username, info)
        } else {
          userInfoByName.commitURLs = [...userInfoByName.commitURLs, ...info.commitURLs]
        }
      });
    }

    // sort contributors by commit count and pull request count
    const sortedContributors = [...allContributorsInfos.entries()]
      .sort(([, userInfoA], [, userInfoB]) => {
        const countA = userInfoA.commitURLs.length
        const countB = userInfoB.commitURLs.length
        return countB - countA
      })
    const contribUserNames = sortedContributors.map(([userName,]) => userName);
    checkContribsPersistence(
      contribUserNames,
      identifier
    )

    const svgString = await generateContributorsSVGFile({
      imgWidth: Number(width),
      blockSize: Number(avatarBlockSize),
      lineCount: Number(lineCount),
    }, new Map(sortedContributors))

    saveSVG(svgString, identifier);
    saveContribsPersistence(
      contribUserNames,
      identifier
    )

    const endTime = performance.now()
    console.log(`Time cost: ${Math.round((endTime - startTime) / 1000)}s`)
  } else {
    if (!token)
      throw new Error('Personal GitHub token is required')
    if (!owner)
      throw new Error('GitHub repo path is required')
  }
}

main()
