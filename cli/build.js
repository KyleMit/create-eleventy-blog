#!/usr/bin/env node

const path = require("path")
const { promises: fs } = require("fs")
const utils = require("./utils")
const generateFavicon = require("../utils/generate-favicon")
const { ALL_TYPES, FILES } = require("../utils/consts")

// get paths
let paths = utils.paths

module.exports = main

async function main(options) {
  try {
    // set global variable for build context
    process.env.ELEVENTY_ENV == process.env.ELEVENTY_ENV || options.environment

    // check that we have a user config
    if (!(await utils.checkConfigExists())) {
      console.log(`cannot perform build - must be called from a folder that has ${FILES.configInput}`)
      return
    }

    // if we still have a temp folder, clean that up
    if (await utils.checkDirExists(paths.engineTempPath)) {
      // remove src and replace with temp
      await utils.removeDir(paths.engineSrcPath)
      await fs.rename(paths.engineTempPath, paths.engineSrcPath)
    }

    // cleanup previous site builds
    await utils.removeDir(paths.engineSitePath, paths.contentSitePath)

    // copy engine src into temp for safe keeping
    await utils.copyDir(paths.engineSrcPath, paths.engineTempPath)

    // copy engine types into src
    await utils.copyDir(paths.engineTypesPath, paths.engineSrcPath)

    // copy content types into src
    for (let dir of ALL_TYPES) {
      let contentFolder = path.join(paths.contentDir, dir)
      let engineSrcFolder = path.join(paths.engineSrcPath, dir)
      await utils.copyDir(contentFolder, engineSrcFolder)
    }

    // get config info
    let objConfig = await utils.getConfig()
    let { taglist: userTaglist, ...metaConfig } = objConfig
    let actualTagList = await utils.getTags(true)

    // remove tags that don't exist
    let usedTags = userTaglist.filter((t) => actualTagList.includes(t.name))

    // add empty tags that do exist
    let usedTagNames = usedTags.map((t) => t.name)
    let missingTagNames = actualTagList.filter((t) => !usedTagNames.includes(t))
    let missingTags = missingTagNames.map((t) => ({
      name: t,
      description: "",
    }))
    let allTags = usedTags.concat(missingTags)

    // save config in data
    await writeJson(paths.engineSrcDataConfigPath, metaConfig)

    // save taglist in data
    await writeJson(paths.engineSrcDataTaglistPath, allTags)

    // pre-processing
    await generateFavicon(metaConfig)

    // exit early
    if (options.preCompile) { return }

    // change working directory, run 11ty, change back
    try {
      process.chdir(paths.engineDir)
      await utils.cmd(`npx @11ty/eleventy`)
    } catch (error) {
      throw new Error(`
Error building 'npx @11ty/eleventy'.

Try precompiling the output and then running eleventy to debug the failure:

    npx create-eleventy-blog build --pre-compile
    cd ${paths.engineDir}
    npx @11ty/eleventy

${error}`)
    }


    // move _site from engine to content
    await utils.copyDir(paths.engineSitePath, paths.contentSitePath)

  } catch (err) {
    console.log(err)

  } finally {
    // change back to content dir
    process.chdir(paths.contentDir)

    // cleanup local temp & site
    await cleanupTempBuild(options)
  }

}

async function cleanupTempBuild(options) {
  // don't cleanup if we set to pre-compile
  if (options.preCompile) { return }

  try {
    if (utils.checkFileExists(paths.engineTempPath)) {
      await utils.removeDir(paths.engineSrcPath)
      await fs.rename(paths.engineTempPath, paths.engineSrcPath)
    }
  } catch (err) {
    console.log({ msg: "Error during cleanup", err })
  }

}

async function writeJson(filePath, obj) {
  let content = JSON.stringify(obj, null, 2)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf8")
}
