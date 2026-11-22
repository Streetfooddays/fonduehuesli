export type ApiAdapter=(url:string,options?:RequestInit)=>Promise<Response>;
let adapter:ApiAdapter|undefined;
export function configureOfferApi(value:ApiAdapter){adapter=value;}
export function apiFetch(url:string,options?:RequestInit){return adapter?adapter(url,options):fetch(url,options);}
