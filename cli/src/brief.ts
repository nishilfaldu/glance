// The brief: what glance writes and the viewer (public/viewer.html) draws. Names, states, calls and flags only.

export type FileState = "changed" | "new" | "same" | "skip";
export type UnitKind = "fn" | "route" | "case" | "dep";
export type FileIcon = "ts" | "js" | "test" | "json" | "md" | "yaml" | "file";

export interface BriefFn {
  name: string;
  kind: UnitKind;
  state: "new" | "changed";
  calls?: string[]; // ids ("path#name") of touched functions this one calls
  flags?: string[]; // names of the rules that matched
}

export interface BriefFile {
  name: string;
  icon: FileIcon;
  state: FileState;
  flags?: string[];
  fns?: BriefFn[]; // changed files only; one with no fns is reviewed as a whole
}

export interface BriefDir {
  name: string;
  color: string;
  files: BriefFile[];
  dirs: BriefDir[];
  more?: number; // unchanged files left out of the list
}

export interface Brief {
  version: 1;
  repo: string;
  title: string;
  head: string;
  base: string;
  root: { name: string; files: BriefFile[]; dirs: BriefDir[] };
}
