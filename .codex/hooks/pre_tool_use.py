"""Guardia local: rechaza borrados que alcancen volúmenes de MiBeca."""

import json
import os
from pathlib import Path
import shlex
import sys


PROJECT = "gestion-de-trabajo-becario-backend"
REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO if REPO.name == PROJECT else REPO.parent / PROJECT
COMPOSE_FILES = {BACKEND / name for name in ("compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml")}


def path_of(value, cwd):
    path = Path(value)
    return (path if path.is_absolute() else cwd / path).resolve()


def compose_targets_backend(args, cwd, assignments):
    files = []
    project_dir = None
    project_name = None
    for index, arg in enumerate(args):
        if arg in ("-f", "--file") and index + 1 < len(args):
            files.append(args[index + 1])
        elif arg.startswith("--file="):
            files.append(arg.split("=", 1)[1])
        elif arg in ("-p", "--project-name") and index + 1 < len(args):
            project_name = args[index + 1]
        elif arg.startswith("--project-name="):
            project_name = arg.split("=", 1)[1]
        elif arg == "--project-directory" and index + 1 < len(args):
            project_dir = args[index + 1]
        elif arg.startswith("--project-directory="):
            project_dir = arg.split("=", 1)[1]

    if not files and assignments.get("COMPOSE_FILE"):
        files = assignments["COMPOSE_FILE"].split(os.pathsep)
    if files:
        return any(path_of(name, cwd) in COMPOSE_FILES for name in files)
    if project_dir:
        return path_of(project_dir, cwd) == BACKEND
    if cwd == BACKEND or BACKEND in cwd.parents:
        return True
    return (project_name or assignments.get("COMPOSE_PROJECT_NAME")) == PROJECT


def volume_is_mibeca(name):
    return name == "mibeca_pgdata" or name.endswith("_mibeca_pgdata")


def filtered_to_other_project(args):
    """Solo un filtro positivo de proyecto explícitamente ajeno acota prune."""
    filters = []
    for index, arg in enumerate(args):
        if arg == "--filter" and index + 1 < len(args):
            filters.append(args[index + 1])
        elif arg.startswith("--filter="):
            filters.append(arg.split("=", 1)[1])
    projects = [f.split("=", 2)[2] for f in filters if f.startswith("label=com.docker.compose.project=")]
    return bool(projects) and all(project != PROJECT for project in projects)


def blocked(command, cwd):
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|")
        lexer.whitespace_split = True
        tokens = list(lexer)
    except ValueError:
        return None

    for index, token in enumerate(tokens):
        if token not in ("docker", "docker-compose"):
            continue
        args = []
        for item in tokens[index + 1 :]:
            if item in (";", "&&", "||", "|", "&"):
                break
            args.append(item)
        assignments = {}
        for item in tokens[:index]:
            if "=" in item and item.split("=", 1)[0] in ("COMPOSE_FILE", "COMPOSE_PROJECT_NAME"):
                key, value = item.split("=", 1)
                assignments[key] = value

        if token == "docker-compose" or (token == "docker" and "compose" in args):
            options = args if token == "docker-compose" else args[args.index("compose") + 1 :]
            removes = ("down" in options or "rm" in options) and any(
                item in ("-v", "--volumes") for item in options
            )
            if removes and compose_targets_backend(options, cwd, assignments):
                return "Compose del backend MiBeca con eliminación de volúmenes"
        elif token == "docker" and "volume" in args:
            options = args[args.index("volume") + 1 :]
            if "rm" in options and any(volume_is_mibeca(item) for item in options[options.index("rm") + 1 :]):
                return "volumen PostgreSQL de MiBeca"
            if "prune" in options and not filtered_to_other_project(options):
                return "prune de volúmenes con alcance ambiguo"
        elif token == "docker" and "system" in args:
            options = args[args.index("system") + 1 :]
            if "prune" in options and "--volumes" in options and not filtered_to_other_project(options):
                return "prune del sistema con alcance ambiguo sobre volúmenes"
    return None


def main():
    event = json.load(sys.stdin)
    tool_input = event.get("tool_input") or {}
    command = tool_input.get("command", "")
    if not isinstance(command, str):
        return
    cwd = path_of(tool_input.get("workdir") or event.get("cwd") or os.getcwd(), Path.cwd())
    condition = blocked(command, cwd)
    if condition is None:
        return
    reason = (
        f"Hook local MiBeca: operación rechazada por {condition}. "
        "Detener o recrear sin -v está permitido. Si una persona autoriza borrar "
        "datos, debe revisar destino y respaldo y ejecutar la orden manualmente "
        "fuera de Codex; el agente no puede cambiar este control para pasar."
    )
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}))


if __name__ == "__main__":
    main()
