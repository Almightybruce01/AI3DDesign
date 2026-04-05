-- Matrix Workshop Desktop: start node server when opened, stop when you Quit this app (Cmd+Q).
-- Leave this app running while you use the workshop in the browser; Quit when finished.

on run
	set desktopPosix to POSIX path of (path to desktop folder)
	set projectFolder to desktopPosix & "AI3DDesign"
	set stateFile to "/tmp/matrix-workshop-owned.pid"
	set logFile to "/tmp/matrix-workshop.log"
	
	try
		do shell script "test -f " & quoted form of (projectFolder & "/server.js")
	on error
		display dialog "Could not find AI3DDesign on your Desktop (need Desktop/AI3DDesign/server.js)." buttons {"OK"} default button 1 with title "Matrix Workshop"
		error number -128
	end try
	
	try
		set httpCode to do shell script "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ 2>/dev/null"
		if httpCode is "200" then
			do shell script "open 'http://localhost:3000/'"
			return
		end if
	end try
	
	try
		do shell script "rm -f " & quoted form of stateFile
		set newPid to do shell script "cd " & quoted form of projectFolder & " && (nohup node server.js >> " & quoted form of logFile & " 2>&1 & echo $!)"
		do shell script "echo " & quoted form of newPid & " > " & quoted form of stateFile
		delay 1.2
		do shell script "open 'http://localhost:3000/'"
	on error errMsg
		display dialog "Could not start server: " & errMsg buttons {"OK"} default button 1 with title "Matrix Workshop"
		error number -128
	end try
end run

-- Stay open until user quits; otherwise the app exits and would tear down the server immediately.
on idle
	return 120
end idle

on quit
	set stateFile to "/tmp/matrix-workshop-owned.pid"
	try
		set pid to do shell script "cat " & quoted form of stateFile & " 2>/dev/null | tr -d ' \\n'"
		if pid is not "" then
			do shell script "kill " & pid & " 2>/dev/null; sleep 0.3; kill -9 " & pid & " 2>/dev/null; true"
			do shell script "rm -f " & quoted form of stateFile
		end if
	end try
	continue quit
end quit
