local LcovReporter = {}
LcovReporter.__index = LcovReporter


function LcovReporter.generate(files)
	local report = {}

	for _, file in ipairs(files) do
		table.insert(report, "TN:")
		table.insert(report, "SF:" .. file.path)
		for lineNumber, hitCount in ipairs(file.lines) do
			if hitCount >= 0 then
				table.insert(report, ("DA:%d,%d"):format(lineNumber, hitCount))
			end
		end
		for i, info in ipairs(file.funcHits) do
			table.insert(report, ("FN:%d,%s"):format(info.Line, info.Name))
			if info.Hits >= 0 then
				table.insert(report, ("FNDA:%d,%s"):format(info.Hits, info.Name))
			end
		end
		table.insert(report, ("LH:%d"):format(file.hits))
		table.insert(report, ("LF:%d"):format(file.hits + file.misses))
		table.insert(report, "end_of_record")
	end

	return table.concat(report, "\n")
end


return LcovReporter
