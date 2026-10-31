'use server';
import { snipers } from '@/lib/snipers/server';
import { respond } from '@/lib/snipers/action-result';

export async function createSnipersClass(input:unknown){return respond(()=>snipers.createClass(input));}
export async function saveSnipersClass(input:unknown){return respond(()=>snipers.saveClass(input));}
export async function transitionSnipersContent(input:unknown){return respond(()=>snipers.transitionContent(input));}
export async function createSnipersCategory(input:unknown){return respond(()=>snipers.createCategory(input));}
export async function saveSnipersCategory(input:unknown){return respond(()=>snipers.saveCategory(input));}
export async function createSnipersMeeting(input:unknown){return respond(()=>snipers.createMeeting(input));}
export async function saveSnipersMeeting(input:unknown){return respond(()=>snipers.saveMeeting(input));}
export async function getSnipersEditorialClass(input:unknown){return respond(()=>snipers.getEditorialClass(input));}
export async function getSnipersEditorialMeeting(input:unknown){return respond(()=>snipers.getEditorialMeeting(input));}
export async function getSnipersEditorialOperation(input:unknown){return respond(()=>snipers.getEditorialOperation(input));}
