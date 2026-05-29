"""Search tools — grep and glob functionality."""

from __future__ import annotations

import subprocess
import glob
import os
from pathlib import Path
from typing import Any

from core.config import Config


def grep_search_handler(cfg: Config, args: dict[str, Any]) -> str:
    """
    Searches for a regex pattern within files.
    Arguments:
      pattern: str (regex)
      dir_path: str (optional, default root)
      case_sensitive: bool (optional, default False)
      include: str (optional glob, e.g. "*.py")
    """
    pattern = args.get("pattern")
    if not pattern:
        return "Error: 'pattern' is required."

    dir_path = args.get("dir_path") or "."
    case_sensitive = args.get("case_sensitive", False)
    include = args.get("include")

    # Construct grep command
    # -r: recursive
    # -n: line numbers
    # -I: ignore binary
    # -E: extended regex
    cmd = ["grep", "-rnIE"]
    
    if not case_sensitive:
        cmd.append("-i")
    
    if include:
        cmd.append(f"--include={include}")
    else:
        # Default excludes for common noise
        cmd.extend(["--exclude-dir=.git", "--exclude-dir=__pycache__", "--exclude-dir=node_modules", "--exclude-dir=venv"])

    cmd.append(pattern)
    cmd.append(dir_path)

    try:
        # Run grep
        result = subprocess.run(
            cmd, 
            capture_output=True, 
            text=True, 
            timeout=30,
            cwd=str(Path(dir_path).resolve()) if Path(dir_path).is_absolute() else os.getcwd()
        )
        
        output = result.stdout.strip()
        
        if not output:
            if result.stderr:
                return f"No matches found. Stderr: {result.stderr}"
            return "No matches found."
            
        # Limit output size
        lines = output.split('\n')
        if len(lines) > 500:
            return "\n".join(lines[:500]) + f"\n... ({len(lines) - 500} more matches truncated)"
        return output

    except subprocess.TimeoutExpired:
        return "Error: Grep search timed out."
    except Exception as e:
        return f"Error executing grep: {e}"


def glob_handler(cfg: Config, args: dict[str, Any]) -> str:
    """
    Finds files matching a glob pattern.
    Arguments:
      pattern: str (e.g. "**/*.py")
      dir_path: str (optional)
    """
    pattern = args.get("pattern")
    if not pattern:
        return "Error: 'pattern' is required."
        
    dir_path = args.get("dir_path") or "."
    
    try:
        # Combine dir and pattern
        search_path = Path(dir_path) / pattern
        # Convert to string for glob
        search_str = str(search_path)
        
        # recursive=True needed for **
        files = glob.glob(search_str, recursive=True)
        
        # Sort and limit
        files.sort()
        
        if not files:
            return "No files found."
            
        if len(files) > 500:
            output = "\n".join(files[:500])
            output += f"\n... ({len(files) - 500} more files truncated)"
        else:
            output = "\n".join(files)
            
        return output
        
    except Exception as e:
        return f"Error executing glob: {e}"
