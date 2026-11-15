export function authInputs(mode,form){
 const email=String(form.get('email')||'').trim(),password=String(form.get('password')||''),repeat=String(form.get('repeat')||''),link=String(form.get('link')||'').trim();
 if(mode==='verify'){if(!link)throw Error('Bitte den Bestätigungslink aus der E-Mail einfügen.');return {link};}
 if(mode!=='password'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Bitte eine gültige E-Mail-Adresse eingeben.');
 if(!password)throw Error('Bitte dein Passwort eingeben.');
 // Existing credentials are checked by the authentication service. Length applies only to new passwords.
 if(mode==='signup'||mode==='password'){if(password.length<10)throw Error('Das neue Passwort muss mindestens 10 Zeichen lang sein.');if(password!==repeat)throw Error('Die Passwörter stimmen nicht überein.');}
 return {email,password,repeat,link};
}
