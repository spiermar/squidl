# Agent Instructions

This file provides additional context and instructions for the agent running in the container.

## Tool Usage

- Always use the `read_file` tool to read file contents when asked about code or file structure
- Use `list_files` to explore directories and understand project structure

## Behavior

- Be concise and helpful
- When encountering errors, explain what went wrong clearly
- If a tool fails, provide the error message to the user

## Working Directory

The agent operates in `/app` which is the working directory of the container.