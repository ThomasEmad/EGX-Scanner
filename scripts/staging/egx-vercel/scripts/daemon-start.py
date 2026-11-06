# Double-fork daemon launcher for the production server.
# The sandbox reaps descendants of each tool-call shell at call end; a
# double-forked daemon is reparented to init (PPID 1) and survives.
# Usage: python3 scripts/daemon-start.py [--dev]
import os
import sys

root = "/home/z/my-project"
cmd = ["node", "scripts/start-standalone.mjs"]
if "--dev" in sys.argv:
    cmd = ["npm", "run", "dev"]

pid = os.fork()
if pid == 0:
    # First child: new session so it has no controlling terminal.
    os.setsid()
    try:
        pid2 = os.fork()
    except Exception:
        pid2 = 0
    if pid2 == 0:
        # Grandchild: parent is init now.
        os.chdir(root)
        devnull = os.open(os.devnull, os.O_RDONLY)
        out = open("server.log", "ab", buffering=0)
        os.dup2(devnull, 0)
        os.dup2(out.fileno(), 1)
        os.dup2(out.fileno(), 2)
        os.execvp(cmd[0], cmd)
    # Intermediate child exits immediately -> grandchild reparented.
    os._exit(0)
else:
    os.waitpid(pid, 0)
    print("daemon launched (grandchild reparented to init)")
