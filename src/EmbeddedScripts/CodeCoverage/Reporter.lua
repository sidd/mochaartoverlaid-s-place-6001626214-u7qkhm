local CodeCoverage = script.Parent
local LcovReporter = require(CodeCoverage.LcovReporter)

local ScriptContext = game:GetService("ScriptContext")
local CoreScriptSyncService = game:GetService("CoreScriptSyncService")

local Reporter = {}
Reporter.__index = Reporter

function Reporter.processCoverageStats(excludes, includes)
	local stats = ScriptContext:GetCoverageStats()

	local files = {}
	for _, scriptStats in ipairs(stats) do
		local aScript = scriptStats.Script;
		path = CoreScriptSyncService:GetScriptFilePath(aScript)
		if Reporter.includeFilter(path, aScript, excludes, includes) then
			local lineHits, funcHits = scriptStats.GetHits()
			local lineHit = 0
			local lineMissed = 0
			local lines = {}

			for n,h in ipairs(lineHits) do
				if h > 0 then
					lineHit = lineHit + 1
				elseif h == 0 then
					lineMissed = lineMissed + 1
				end

				lines[n] = h
			end

			table.insert(files, {
				script = aScript,
				path = path,
				lines = lines,
				hits = lineHit,
				misses = lineMissed,
				funcHits = funcHits
			})
		end
	end

	return files
end

function Reporter.matchesAny(str, pattersList)
	if not str or str:len() == 0 or not pattersList or #pattersList == 0 then
		return false
	end

	for _,exclude in ipairs(pattersList) do
		if string.find(str, exclude) ~= nil then
			return true
		end
	end
	return false
end

function Reporter.includeFilter(path, aScript, excludes, includes)
	local isExcluded = aScript.Name:match(".spec$")
		or aScript:FindFirstAncestor("TestEZ")
		or aScript:IsDescendantOf(CodeCoverage)
		or Reporter.matchesAny(path, excludes)
	local isIncluded = path and path:len() > 0

	if isIncluded and includes ~= nil and #includes > 0 then
		isIncluded = Reporter.matchesAny(path, includes)
	end

	return isIncluded and not isExcluded
end

function Reporter.generateReport(path, excludes, includes)
	local stats = Reporter.processCoverageStats(excludes, includes)
	local report = LcovReporter.generate(stats)

	if report:len() == 0 then
		warn("Generating code coverage report failed. Produced report has zero size.")
		return
	end

	local success, message = pcall(function()
		local fs = game:GetService("FileSystemService")
		fs:WriteFile(path, report)
	end)

	if not success then
		warn("Failed to save code coverage report at path: " .. path .. "\nError: " .. message)
	end
end

return Reporter
