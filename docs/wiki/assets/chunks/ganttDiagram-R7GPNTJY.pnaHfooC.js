import{aL as _t,aK as Dt,v as he,s as me,O as ke,N as ye,w as ge,x as ve,_ as l,k as dt,E as pt,aS as pe,aT as Te,aU as xe,y as be,ae as we,aV as _e,aW as q,l as it,aX as De,aY as Ht,aZ as Bt,a_ as Se,a$ as Ce,b0 as Me,b1 as Ee,b2 as Ie,b3 as Ye,b4 as $e,b5 as Gt,b6 as jt,b7 as Ut,b8 as Xt,b9 as qt,ba as Le,G as Ae,J as Fe,V as Oe,u as We}from"./theme.mHRXxg9j.js";import"./framework.DBpCFmh2.js";var Jt={exports:{}};(function(t,i){(function(n,e){t.exports=e()})(_t,function(){var n="day";return function(e,a,g){var v=function(F){return F.add(4-F.isoWeekday(),n)},b=a.prototype;b.isoWeekYear=function(){return v(this).year()},b.isoWeek=function(F){if(!this.$utils().u(F))return this.add(7*(F-this.isoWeek()),n);var w,O,$,H,R=v(this),N=(w=this.isoWeekYear(),O=this.$u,$=(O?g.utc:g)().year(w).startOf("year"),H=4-$.isoWeekday(),$.isoWeekday()>4&&(H+=7),$.add(H,n));return R.diff(N,"week")+1},b.isoWeekday=function(F){return this.$utils().u(F)?this.day()||7:this.day(this.day()%7?F:F-7)};var L=b.startOf;b.startOf=function(F,w){var O=this.$utils(),$=!!O.u(w)||w;return O.p(F)==="isoweek"?$?this.date(this.date()-(this.isoWeekday()-1)).startOf("day"):this.date(this.date()-1-(this.isoWeekday()-1)+7).endOf("day"):L.bind(this)(F,w)}}})})(Jt);var Ve=Jt.exports;const Pe=Dt(Ve);var te={exports:{}};(function(t,i){(function(n,e){t.exports=e()})(_t,function(){var n={LTS:"h:mm:ss A",LT:"h:mm A",L:"MM/DD/YYYY",LL:"MMMM D, YYYY",LLL:"MMMM D, YYYY h:mm A",LLLL:"dddd, MMMM D, YYYY h:mm A"},e=/(\[[^[]*\])|([-_:/.,()\s]+)|(A|a|Q|YYYY|YY?|ww?|MM?M?M?|Do|DD?|hh?|HH?|mm?|ss?|S{1,3}|z|ZZ?)/g,a=/\d/,g=/\d\d/,v=/\d\d?/,b=/\d*[^-_:/,()\s\d]+/,L={},F=function(k){return(k=+k)+(k>68?1900:2e3)},w=function(k){return function(E){this[k]=+E}},O=[/[+-]\d\d:?(\d\d)?|Z/,function(k){(this.zone||(this.zone={})).offset=function(E){if(!E||E==="Z")return 0;var W=E.match(/([+-]|\d\d)/g),A=60*W[1]+(+W[2]||0);return A===0?0:W[0]==="+"?-A:A}(k)}],$=function(k){var E=L[k];return E&&(E.indexOf?E:E.s.concat(E.f))},H=function(k,E){var W,A=L.meridiem;if(A){for(var X=1;X<=24;X+=1)if(k.indexOf(A(X,0,E))>-1){W=X>12;break}}else W=k===(E?"pm":"PM");return W},R={A:[b,function(k){this.afternoon=H(k,!1)}],a:[b,function(k){this.afternoon=H(k,!0)}],Q:[a,function(k){this.month=3*(k-1)+1}],S:[a,function(k){this.milliseconds=100*+k}],SS:[g,function(k){this.milliseconds=10*+k}],SSS:[/\d{3}/,function(k){this.milliseconds=+k}],s:[v,w("seconds")],ss:[v,w("seconds")],m:[v,w("minutes")],mm:[v,w("minutes")],H:[v,w("hours")],h:[v,w("hours")],HH:[v,w("hours")],hh:[v,w("hours")],D:[v,w("day")],DD:[g,w("day")],Do:[b,function(k){var E=L.ordinal,W=k.match(/\d+/);if(this.day=W[0],E)for(var A=1;A<=31;A+=1)E(A).replace(/\[|\]/g,"")===k&&(this.day=A)}],w:[v,w("week")],ww:[g,w("week")],M:[v,w("month")],MM:[g,w("month")],MMM:[b,function(k){var E=$("months"),W=($("monthsShort")||E.map(function(A){return A.slice(0,3)})).indexOf(k)+1;if(W<1)throw new Error;this.month=W%12||W}],MMMM:[b,function(k){var E=$("months").indexOf(k)+1;if(E<1)throw new Error;this.month=E%12||E}],Y:[/[+-]?\d+/,w("year")],YY:[g,function(k){this.year=F(k)}],YYYY:[/\d{4}/,w("year")],Z:O,ZZ:O};function N(k){var E,W;E=k,W=L&&L.formats;for(var A=(k=E.replace(/(\[[^\]]+])|(LTS?|l{1,4}|L{1,4})/g,function(m,T,p){var y=p&&p.toUpperCase();return T||W[p]||n[p]||W[y].replace(/(\[[^\]]+])|(MMMM|MM|DD|dddd)/g,function(r,d,f){return d||f.slice(1)})})).match(e),X=A.length,G=0;G<X;G+=1){var Y=A[G],x=R[Y],h=x&&x[0],I=x&&x[1];A[G]=I?{regex:h,parser:I}:Y.replace(/^\[|\]$/g,"")}return function(m){for(var T={},p=0,y=0;p<X;p+=1){var r=A[p];if(typeof r=="string")y+=r.length;else{var d=r.regex,f=r.parser,u=m.slice(y),_=d.exec(u)[0];f.call(T,_),m=m.replace(_,"")}}return function(s){var D=s.afternoon;if(D!==void 0){var o=s.hours;D?o<12&&(s.hours+=12):o===12&&(s.hours=0),delete s.afternoon}}(T),T}}return function(k,E,W){W.p.customParseFormat=!0,k&&k.parseTwoDigitYear&&(F=k.parseTwoDigitYear);var A=E.prototype,X=A.parse;A.parse=function(G){var Y=G.date,x=G.utc,h=G.args;this.$u=x;var I=h[1];if(typeof I=="string"){var m=h[2]===!0,T=h[3]===!0,p=m||T,y=h[2];T&&(y=h[2]),L=this.$locale(),!m&&y&&(L=W.Ls[y]),this.$d=function(u,_,s,D){try{if(["x","X"].indexOf(_)>-1)return new Date((_==="X"?1e3:1)*u);var o=N(_)(u),B=o.year,c=o.month,S=o.day,C=o.hours,P=o.minutes,M=o.seconds,z=o.milliseconds,V=o.zone,nt=o.week,at=new Date,yt=S||(B||c?1:at.getDate()),lt=B||at.getFullYear(),j=0;B&&!c||(j=c>0?c-1:at.getMonth());var K,Z=C||0,ot=P||0,J=M||0,rt=z||0;return V?new Date(Date.UTC(lt,j,yt,Z,ot,J,rt+60*V.offset*1e3)):s?new Date(Date.UTC(lt,j,yt,Z,ot,J,rt)):(K=new Date(lt,j,yt,Z,ot,J,rt),nt&&(K=D(K).week(nt).toDate()),K)}catch{return new Date("")}}(Y,I,x,W),this.init(),y&&y!==!0&&(this.$L=this.locale(y).$L),p&&Y!=this.format(I)&&(this.$d=new Date("")),L={}}else if(I instanceof Array)for(var r=I.length,d=1;d<=r;d+=1){h[1]=I[d-1];var f=W.apply(this,h);if(f.isValid()){this.$d=f.$d,this.$L=f.$L,this.init();break}d===r&&(this.$d=new Date(""))}else X.call(this,G)}}})})(te);var Ne=te.exports;const Re=Dt(Ne);var ee={exports:{}};(function(t,i){(function(n,e){t.exports=e()})(_t,function(){return function(n,e){var a=e.prototype,g=a.format;a.format=function(v){var b=this,L=this.$locale();if(!this.isValid())return g.bind(this)(v);var F=this.$utils(),w=(v||"YYYY-MM-DDTHH:mm:ssZ").replace(/\[([^\]]+)]|Q|wo|ww|w|WW|W|zzz|z|gggg|GGGG|Do|X|x|k{1,2}|S/g,function(O){switch(O){case"Q":return Math.ceil((b.$M+1)/3);case"Do":return L.ordinal(b.$D);case"gggg":return b.weekYear();case"GGGG":return b.isoWeekYear();case"wo":return L.ordinal(b.week(),"W");case"w":case"ww":return F.s(b.week(),O==="w"?1:2,"0");case"W":case"WW":return F.s(b.isoWeek(),O==="W"?1:2,"0");case"k":case"kk":return F.s(String(b.$H===0?24:b.$H),O==="k"?1:2,"0");case"X":return Math.floor(b.$d.getTime()/1e3);case"x":return b.$d.getTime();case"z":return"["+b.offsetName()+"]";case"zzz":return"["+b.offsetName("long")+"]";default:return O}});return g.bind(this)(w)}}})})(ee);var ze=ee.exports;const He=Dt(ze);var se={exports:{}};(function(t,i){(function(n,e){t.exports=e()})(_t,function(){var n,e,a=1e3,g=6e4,v=36e5,b=864e5,L=31536e6,F=2628e6,w=/^(-|\+)?P(?:([-+]?[0-9,.]*)Y)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)W)?(?:([-+]?[0-9,.]*)D)?(?:T(?:([-+]?[0-9,.]*)H)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)S)?)?$/,O=/\[([^\]]+)]|YYYY|YY|Y|M{1,2}|D{1,2}|H{1,2}|m{1,2}|s{1,2}|SSS/g,$={years:L,months:F,days:b,hours:v,minutes:g,seconds:a,milliseconds:1,weeks:6048e5},H=function(Y){return Y instanceof X},R=function(Y,x,h){return new X(Y,h,x.$l)},N=function(Y){return e.p(Y)+"s"},k=function(Y){return Y<0},E=function(Y){return k(Y)?Math.ceil(Y):Math.floor(Y)},W=function(Y){return Math.abs(Y)},A=function(Y,x){return Y?k(Y)?{negative:!0,format:""+W(Y)+x}:{negative:!1,format:""+Y+x}:{negative:!1,format:""}},X=function(){function Y(h,I,m){var T=this;if(this.$d={},this.$l=m,h===void 0&&(this.$ms=0,this.parseFromMilliseconds()),I)return R(h*$[N(I)],this);if(typeof h=="number")return this.$ms=h,this.parseFromMilliseconds(),this;if(typeof h=="object")return Object.keys(h).forEach(function(r){T.$d[N(r)]=h[r]}),this.calMilliseconds(),this;if(typeof h=="string"){var p=h.match(w);if(p){var y=p.slice(2).map(function(r){return r!=null?Number(r):0});return this.$d.years=y[0],this.$d.months=y[1],this.$d.weeks=y[2],this.$d.days=y[3],this.$d.hours=y[4],this.$d.minutes=y[5],this.$d.seconds=y[6],this.calMilliseconds(),this}}return this}var x=Y.prototype;return x.calMilliseconds=function(){var h=this;this.$ms=Object.keys(this.$d).reduce(function(I,m){return I+(h.$d[m]||0)*$[m]},0)},x.parseFromMilliseconds=function(){var h=this.$ms;this.$d.years=E(h/L),h%=L,this.$d.months=E(h/F),h%=F,this.$d.days=E(h/b),h%=b,this.$d.hours=E(h/v),h%=v,this.$d.minutes=E(h/g),h%=g,this.$d.seconds=E(h/a),h%=a,this.$d.milliseconds=h},x.toISOString=function(){var h=A(this.$d.years,"Y"),I=A(this.$d.months,"M"),m=+this.$d.days||0;this.$d.weeks&&(m+=7*this.$d.weeks);var T=A(m,"D"),p=A(this.$d.hours,"H"),y=A(this.$d.minutes,"M"),r=this.$d.seconds||0;this.$d.milliseconds&&(r+=this.$d.milliseconds/1e3,r=Math.round(1e3*r)/1e3);var d=A(r,"S"),f=h.negative||I.negative||T.negative||p.negative||y.negative||d.negative,u=p.format||y.format||d.format?"T":"",_=(f?"-":"")+"P"+h.format+I.format+T.format+u+p.format+y.format+d.format;return _==="P"||_==="-P"?"P0D":_},x.toJSON=function(){return this.toISOString()},x.format=function(h){var I=h||"YYYY-MM-DDTHH:mm:ss",m={Y:this.$d.years,YY:e.s(this.$d.years,2,"0"),YYYY:e.s(this.$d.years,4,"0"),M:this.$d.months,MM:e.s(this.$d.months,2,"0"),D:this.$d.days,DD:e.s(this.$d.days,2,"0"),H:this.$d.hours,HH:e.s(this.$d.hours,2,"0"),m:this.$d.minutes,mm:e.s(this.$d.minutes,2,"0"),s:this.$d.seconds,ss:e.s(this.$d.seconds,2,"0"),SSS:e.s(this.$d.milliseconds,3,"0")};return I.replace(O,function(T,p){return p||String(m[T])})},x.as=function(h){return this.$ms/$[N(h)]},x.get=function(h){var I=this.$ms,m=N(h);return m==="milliseconds"?I%=1e3:I=m==="weeks"?E(I/$[m]):this.$d[m],I||0},x.add=function(h,I,m){var T;return T=I?h*$[N(I)]:H(h)?h.$ms:R(h,this).$ms,R(this.$ms+T*(m?-1:1),this)},x.subtract=function(h,I){return this.add(h,I,!0)},x.locale=function(h){var I=this.clone();return I.$l=h,I},x.clone=function(){return R(this.$ms,this)},x.humanize=function(h){return n().add(this.$ms,"ms").locale(this.$l).fromNow(!h)},x.valueOf=function(){return this.asMilliseconds()},x.milliseconds=function(){return this.get("milliseconds")},x.asMilliseconds=function(){return this.as("milliseconds")},x.seconds=function(){return this.get("seconds")},x.asSeconds=function(){return this.as("seconds")},x.minutes=function(){return this.get("minutes")},x.asMinutes=function(){return this.as("minutes")},x.hours=function(){return this.get("hours")},x.asHours=function(){return this.as("hours")},x.days=function(){return this.get("days")},x.asDays=function(){return this.as("days")},x.weeks=function(){return this.get("weeks")},x.asWeeks=function(){return this.as("weeks")},x.months=function(){return this.get("months")},x.asMonths=function(){return this.as("months")},x.years=function(){return this.get("years")},x.asYears=function(){return this.as("years")},Y}(),G=function(Y,x,h){return Y.add(x.years()*h,"y").add(x.months()*h,"M").add(x.days()*h,"d").add(x.hours()*h,"h").add(x.minutes()*h,"m").add(x.seconds()*h,"s").add(x.milliseconds()*h,"ms")};return function(Y,x,h){n=h,e=h().$utils(),h.duration=function(T,p){var y=h.locale();return R(T,{$l:y},p)},h.isDuration=H;var I=x.prototype.add,m=x.prototype.subtract;x.prototype.add=function(T,p){return H(T)?G(this,T,1):I.bind(this)(T,p)},x.prototype.subtract=function(T,p){return H(T)?G(this,T,-1):m.bind(this)(T,p)}}})})(se);var Be=se.exports;const Ge=Dt(Be);var Mt=function(){var t=l(function(y,r,d,f){for(d=d||{},f=y.length;f--;d[y[f]]=r);return d},"o"),i=[6,8,10,12,13,14,15,16,17,18,20,21,22,23,24,25,26,27,28,29,30,31,33,35,36,38,40],n=[1,26],e=[1,27],a=[1,28],g=[1,29],v=[1,30],b=[1,31],L=[1,32],F=[1,33],w=[1,34],O=[1,9],$=[1,10],H=[1,11],R=[1,12],N=[1,13],k=[1,14],E=[1,15],W=[1,16],A=[1,19],X=[1,20],G=[1,21],Y=[1,22],x=[1,23],h=[1,25],I=[1,35],m={trace:l(function(){},"trace"),yy:{},symbols_:{error:2,start:3,gantt:4,document:5,EOF:6,line:7,SPACE:8,statement:9,NL:10,weekday:11,weekday_monday:12,weekday_tuesday:13,weekday_wednesday:14,weekday_thursday:15,weekday_friday:16,weekday_saturday:17,weekday_sunday:18,weekend:19,weekend_friday:20,weekend_saturday:21,dateFormat:22,inclusiveEndDates:23,topAxis:24,axisFormat:25,tickInterval:26,excludes:27,includes:28,todayMarker:29,title:30,acc_title:31,acc_title_value:32,acc_descr:33,acc_descr_value:34,acc_descr_multiline_value:35,section:36,clickStatement:37,taskTxt:38,taskData:39,click:40,callbackname:41,callbackargs:42,href:43,clickStatementDebug:44,$accept:0,$end:1},terminals_:{2:"error",4:"gantt",6:"EOF",8:"SPACE",10:"NL",12:"weekday_monday",13:"weekday_tuesday",14:"weekday_wednesday",15:"weekday_thursday",16:"weekday_friday",17:"weekday_saturday",18:"weekday_sunday",20:"weekend_friday",21:"weekend_saturday",22:"dateFormat",23:"inclusiveEndDates",24:"topAxis",25:"axisFormat",26:"tickInterval",27:"excludes",28:"includes",29:"todayMarker",30:"title",31:"acc_title",32:"acc_title_value",33:"acc_descr",34:"acc_descr_value",35:"acc_descr_multiline_value",36:"section",38:"taskTxt",39:"taskData",40:"click",41:"callbackname",42:"callbackargs",43:"href"},productions_:[0,[3,3],[5,0],[5,2],[7,2],[7,1],[7,1],[7,1],[11,1],[11,1],[11,1],[11,1],[11,1],[11,1],[11,1],[19,1],[19,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,1],[9,2],[9,2],[9,1],[9,1],[9,1],[9,2],[37,2],[37,3],[37,3],[37,4],[37,3],[37,4],[37,2],[44,2],[44,3],[44,3],[44,4],[44,3],[44,4],[44,2]],performAction:l(function(r,d,f,u,_,s,D){var o=s.length-1;switch(_){case 1:return s[o-1];case 2:this.$=[];break;case 3:s[o-1].push(s[o]),this.$=s[o-1];break;case 4:case 5:this.$=s[o];break;case 6:case 7:this.$=[];break;case 8:u.setWeekday("monday");break;case 9:u.setWeekday("tuesday");break;case 10:u.setWeekday("wednesday");break;case 11:u.setWeekday("thursday");break;case 12:u.setWeekday("friday");break;case 13:u.setWeekday("saturday");break;case 14:u.setWeekday("sunday");break;case 15:u.setWeekend("friday");break;case 16:u.setWeekend("saturday");break;case 17:u.setDateFormat(s[o].substr(11)),this.$=s[o].substr(11);break;case 18:u.enableInclusiveEndDates(),this.$=s[o].substr(18);break;case 19:u.TopAxis(),this.$=s[o].substr(8);break;case 20:u.setAxisFormat(s[o].substr(11)),this.$=s[o].substr(11);break;case 21:u.setTickInterval(s[o].substr(13)),this.$=s[o].substr(13);break;case 22:u.setExcludes(s[o].substr(9)),this.$=s[o].substr(9);break;case 23:u.setIncludes(s[o].substr(9)),this.$=s[o].substr(9);break;case 24:u.setTodayMarker(s[o].substr(12)),this.$=s[o].substr(12);break;case 27:u.setDiagramTitle(s[o].substr(6)),this.$=s[o].substr(6);break;case 28:this.$=s[o].trim(),u.setAccTitle(this.$);break;case 29:case 30:this.$=s[o].trim(),u.setAccDescription(this.$);break;case 31:u.addSection(s[o].substr(8)),this.$=s[o].substr(8);break;case 33:u.addTask(s[o-1],s[o]),this.$="task";break;case 34:this.$=s[o-1],u.setClickEvent(s[o-1],s[o],null);break;case 35:this.$=s[o-2],u.setClickEvent(s[o-2],s[o-1],s[o]);break;case 36:this.$=s[o-2],u.setClickEvent(s[o-2],s[o-1],null),u.setLink(s[o-2],s[o]);break;case 37:this.$=s[o-3],u.setClickEvent(s[o-3],s[o-2],s[o-1]),u.setLink(s[o-3],s[o]);break;case 38:this.$=s[o-2],u.setClickEvent(s[o-2],s[o],null),u.setLink(s[o-2],s[o-1]);break;case 39:this.$=s[o-3],u.setClickEvent(s[o-3],s[o-1],s[o]),u.setLink(s[o-3],s[o-2]);break;case 40:this.$=s[o-1],u.setLink(s[o-1],s[o]);break;case 41:case 47:this.$=s[o-1]+" "+s[o];break;case 42:case 43:case 45:this.$=s[o-2]+" "+s[o-1]+" "+s[o];break;case 44:case 46:this.$=s[o-3]+" "+s[o-2]+" "+s[o-1]+" "+s[o];break}},"anonymous"),table:[{3:1,4:[1,2]},{1:[3]},t(i,[2,2],{5:3}),{6:[1,4],7:5,8:[1,6],9:7,10:[1,8],11:17,12:n,13:e,14:a,15:g,16:v,17:b,18:L,19:18,20:F,21:w,22:O,23:$,24:H,25:R,26:N,27:k,28:E,29:W,30:A,31:X,33:G,35:Y,36:x,37:24,38:h,40:I},t(i,[2,7],{1:[2,1]}),t(i,[2,3]),{9:36,11:17,12:n,13:e,14:a,15:g,16:v,17:b,18:L,19:18,20:F,21:w,22:O,23:$,24:H,25:R,26:N,27:k,28:E,29:W,30:A,31:X,33:G,35:Y,36:x,37:24,38:h,40:I},t(i,[2,5]),t(i,[2,6]),t(i,[2,17]),t(i,[2,18]),t(i,[2,19]),t(i,[2,20]),t(i,[2,21]),t(i,[2,22]),t(i,[2,23]),t(i,[2,24]),t(i,[2,25]),t(i,[2,26]),t(i,[2,27]),{32:[1,37]},{34:[1,38]},t(i,[2,30]),t(i,[2,31]),t(i,[2,32]),{39:[1,39]},t(i,[2,8]),t(i,[2,9]),t(i,[2,10]),t(i,[2,11]),t(i,[2,12]),t(i,[2,13]),t(i,[2,14]),t(i,[2,15]),t(i,[2,16]),{41:[1,40],43:[1,41]},t(i,[2,4]),t(i,[2,28]),t(i,[2,29]),t(i,[2,33]),t(i,[2,34],{42:[1,42],43:[1,43]}),t(i,[2,40],{41:[1,44]}),t(i,[2,35],{43:[1,45]}),t(i,[2,36]),t(i,[2,38],{42:[1,46]}),t(i,[2,37]),t(i,[2,39])],defaultActions:{},parseError:l(function(r,d){if(d.recoverable)this.trace(r);else{var f=new Error(r);throw f.hash=d,f}},"parseError"),parse:l(function(r){var d=this,f=[0],u=[],_=[null],s=[],D=this.table,o="",B=0,c=0,S=2,C=1,P=s.slice.call(arguments,1),M=Object.create(this.lexer),z={yy:{}};for(var V in this.yy)Object.prototype.hasOwnProperty.call(this.yy,V)&&(z.yy[V]=this.yy[V]);M.setInput(r,z.yy),z.yy.lexer=M,z.yy.parser=this,typeof M.yylloc>"u"&&(M.yylloc={});var nt=M.yylloc;s.push(nt);var at=M.options&&M.options.ranges;typeof z.yy.parseError=="function"?this.parseError=z.yy.parseError:this.parseError=Object.getPrototypeOf(this).parseError;function yt(Q){f.length=f.length-2*Q,_.length=_.length-Q,s.length=s.length-Q}l(yt,"popStack");function lt(){var Q;return Q=u.pop()||M.lex()||C,typeof Q!="number"&&(Q instanceof Array&&(u=Q,Q=u.pop()),Q=d.symbols_[Q]||Q),Q}l(lt,"lex");for(var j,K,Z,ot,J={},rt,tt,zt,vt;;){if(K=f[f.length-1],this.defaultActions[K]?Z=this.defaultActions[K]:((j===null||typeof j>"u")&&(j=lt()),Z=D[K]&&D[K][j]),typeof Z>"u"||!Z.length||!Z[0]){var St="";vt=[];for(rt in D[K])this.terminals_[rt]&&rt>S&&vt.push("'"+this.terminals_[rt]+"'");M.showPosition?St="Parse error on line "+(B+1)+`:
`+M.showPosition()+`
Expecting `+vt.join(", ")+", got '"+(this.terminals_[j]||j)+"'":St="Parse error on line "+(B+1)+": Unexpected "+(j==C?"end of input":"'"+(this.terminals_[j]||j)+"'"),this.parseError(St,{text:M.match,token:this.terminals_[j]||j,line:M.yylineno,loc:nt,expected:vt})}if(Z[0]instanceof Array&&Z.length>1)throw new Error("Parse Error: multiple actions possible at state: "+K+", token: "+j);switch(Z[0]){case 1:f.push(j),_.push(M.yytext),s.push(M.yylloc),f.push(Z[1]),j=null,c=M.yyleng,o=M.yytext,B=M.yylineno,nt=M.yylloc;break;case 2:if(tt=this.productions_[Z[1]][1],J.$=_[_.length-tt],J._$={first_line:s[s.length-(tt||1)].first_line,last_line:s[s.length-1].last_line,first_column:s[s.length-(tt||1)].first_column,last_column:s[s.length-1].last_column},at&&(J._$.range=[s[s.length-(tt||1)].range[0],s[s.length-1].range[1]]),ot=this.performAction.apply(J,[o,c,B,z.yy,Z[1],_,s].concat(P)),typeof ot<"u")return ot;tt&&(f=f.slice(0,-1*tt*2),_=_.slice(0,-1*tt),s=s.slice(0,-1*tt)),f.push(this.productions_[Z[1]][0]),_.push(J.$),s.push(J._$),zt=D[f[f.length-2]][f[f.length-1]],f.push(zt);break;case 3:return!0}}return!0},"parse")},T=function(){var y={EOF:1,parseError:l(function(d,f){if(this.yy.parser)this.yy.parser.parseError(d,f);else throw new Error(d)},"parseError"),setInput:l(function(r,d){return this.yy=d||this.yy||{},this._input=r,this._more=this._backtrack=this.done=!1,this.yylineno=this.yyleng=0,this.yytext=this.matched=this.match="",this.conditionStack=["INITIAL"],this.yylloc={first_line:1,first_column:0,last_line:1,last_column:0},this.options.ranges&&(this.yylloc.range=[0,0]),this.offset=0,this},"setInput"),input:l(function(){var r=this._input[0];this.yytext+=r,this.yyleng++,this.offset++,this.match+=r,this.matched+=r;var d=r.match(/(?:\r\n?|\n).*/g);return d?(this.yylineno++,this.yylloc.last_line++):this.yylloc.last_column++,this.options.ranges&&this.yylloc.range[1]++,this._input=this._input.slice(1),r},"input"),unput:l(function(r){var d=r.length,f=r.split(/(?:\r\n?|\n)/g);this._input=r+this._input,this.yytext=this.yytext.substr(0,this.yytext.length-d),this.offset-=d;var u=this.match.split(/(?:\r\n?|\n)/g);this.match=this.match.substr(0,this.match.length-1),this.matched=this.matched.substr(0,this.matched.length-1),f.length-1&&(this.yylineno-=f.length-1);var _=this.yylloc.range;return this.yylloc={first_line:this.yylloc.first_line,last_line:this.yylineno+1,first_column:this.yylloc.first_column,last_column:f?(f.length===u.length?this.yylloc.first_column:0)+u[u.length-f.length].length-f[0].length:this.yylloc.first_column-d},this.options.ranges&&(this.yylloc.range=[_[0],_[0]+this.yyleng-d]),this.yyleng=this.yytext.length,this},"unput"),more:l(function(){return this._more=!0,this},"more"),reject:l(function(){if(this.options.backtrack_lexer)this._backtrack=!0;else return this.parseError("Lexical error on line "+(this.yylineno+1)+`. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).
`+this.showPosition(),{text:"",token:null,line:this.yylineno});return this},"reject"),less:l(function(r){this.unput(this.match.slice(r))},"less"),pastInput:l(function(){var r=this.matched.substr(0,this.matched.length-this.match.length);return(r.length>20?"...":"")+r.substr(-20).replace(/\n/g,"")},"pastInput"),upcomingInput:l(function(){var r=this.match;return r.length<20&&(r+=this._input.substr(0,20-r.length)),(r.substr(0,20)+(r.length>20?"...":"")).replace(/\n/g,"")},"upcomingInput"),showPosition:l(function(){var r=this.pastInput(),d=new Array(r.length+1).join("-");return r+this.upcomingInput()+`
`+d+"^"},"showPosition"),test_match:l(function(r,d){var f,u,_;if(this.options.backtrack_lexer&&(_={yylineno:this.yylineno,yylloc:{first_line:this.yylloc.first_line,last_line:this.last_line,first_column:this.yylloc.first_column,last_column:this.yylloc.last_column},yytext:this.yytext,match:this.match,matches:this.matches,matched:this.matched,yyleng:this.yyleng,offset:this.offset,_more:this._more,_input:this._input,yy:this.yy,conditionStack:this.conditionStack.slice(0),done:this.done},this.options.ranges&&(_.yylloc.range=this.yylloc.range.slice(0))),u=r[0].match(/(?:\r\n?|\n).*/g),u&&(this.yylineno+=u.length),this.yylloc={first_line:this.yylloc.last_line,last_line:this.yylineno+1,first_column:this.yylloc.last_column,last_column:u?u[u.length-1].length-u[u.length-1].match(/\r?\n?/)[0].length:this.yylloc.last_column+r[0].length},this.yytext+=r[0],this.match+=r[0],this.matches=r,this.yyleng=this.yytext.length,this.options.ranges&&(this.yylloc.range=[this.offset,this.offset+=this.yyleng]),this._more=!1,this._backtrack=!1,this._input=this._input.slice(r[0].length),this.matched+=r[0],f=this.performAction.call(this,this.yy,this,d,this.conditionStack[this.conditionStack.length-1]),this.done&&this._input&&(this.done=!1),f)return f;if(this._backtrack){for(var s in _)this[s]=_[s];return!1}return!1},"test_match"),next:l(function(){if(this.done)return this.EOF;this._input||(this.done=!0);var r,d,f,u;this._more||(this.yytext="",this.match="");for(var _=this._currentRules(),s=0;s<_.length;s++)if(f=this._input.match(this.rules[_[s]]),f&&(!d||f[0].length>d[0].length)){if(d=f,u=s,this.options.backtrack_lexer){if(r=this.test_match(f,_[s]),r!==!1)return r;if(this._backtrack){d=!1;continue}else return!1}else if(!this.options.flex)break}return d?(r=this.test_match(d,_[u]),r!==!1?r:!1):this._input===""?this.EOF:this.parseError("Lexical error on line "+(this.yylineno+1)+`. Unrecognized text.
`+this.showPosition(),{text:"",token:null,line:this.yylineno})},"next"),lex:l(function(){var d=this.next();return d||this.lex()},"lex"),begin:l(function(d){this.conditionStack.push(d)},"begin"),popState:l(function(){var d=this.conditionStack.length-1;return d>0?this.conditionStack.pop():this.conditionStack[0]},"popState"),_currentRules:l(function(){return this.conditionStack.length&&this.conditionStack[this.conditionStack.length-1]?this.conditions[this.conditionStack[this.conditionStack.length-1]].rules:this.conditions.INITIAL.rules},"_currentRules"),topState:l(function(d){return d=this.conditionStack.length-1-Math.abs(d||0),d>=0?this.conditionStack[d]:"INITIAL"},"topState"),pushState:l(function(d){this.begin(d)},"pushState"),stateStackSize:l(function(){return this.conditionStack.length},"stateStackSize"),options:{"case-insensitive":!0},performAction:l(function(d,f,u,_){switch(u){case 0:return this.begin("open_directive"),"open_directive";case 1:return this.begin("acc_title"),31;case 2:return this.popState(),"acc_title_value";case 3:return this.begin("acc_descr"),33;case 4:return this.popState(),"acc_descr_value";case 5:this.begin("acc_descr_multiline");break;case 6:this.popState();break;case 7:return"acc_descr_multiline_value";case 8:break;case 9:break;case 10:break;case 11:return 10;case 12:break;case 13:break;case 14:this.begin("href");break;case 15:this.popState();break;case 16:return 43;case 17:this.begin("callbackname");break;case 18:this.popState();break;case 19:this.popState(),this.begin("callbackargs");break;case 20:return 41;case 21:this.popState();break;case 22:return 42;case 23:this.begin("click");break;case 24:this.popState();break;case 25:return 40;case 26:return 4;case 27:return 22;case 28:return 23;case 29:return 24;case 30:return 25;case 31:return 26;case 32:return 28;case 33:return 27;case 34:return 29;case 35:return 12;case 36:return 13;case 37:return 14;case 38:return 15;case 39:return 16;case 40:return 17;case 41:return 18;case 42:return 20;case 43:return 21;case 44:return"date";case 45:return 30;case 46:return"accDescription";case 47:return 36;case 48:return 38;case 49:return 39;case 50:return":";case 51:return 6;case 52:return"INVALID"}},"anonymous"),rules:[/^(?:%%\{)/i,/^(?:accTitle\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*:\s*)/i,/^(?:(?!\n||)*[^\n]*)/i,/^(?:accDescr\s*\{\s*)/i,/^(?:[\}])/i,/^(?:[^\}]*)/i,/^(?:%%(?!\{)*[^\n]*)/i,/^(?:[^\}]%%*[^\n]*)/i,/^(?:%%*[^\n]*[\n]*)/i,/^(?:[\n]+)/i,/^(?:\s+)/i,/^(?:%[^\n]*)/i,/^(?:href[\s]+["])/i,/^(?:["])/i,/^(?:[^"]*)/i,/^(?:call[\s]+)/i,/^(?:\([\s]*\))/i,/^(?:\()/i,/^(?:[^(]*)/i,/^(?:\))/i,/^(?:[^)]*)/i,/^(?:click[\s]+)/i,/^(?:[\s\n])/i,/^(?:[^\s\n]*)/i,/^(?:gantt\b)/i,/^(?:dateFormat\s[^#\n;]+)/i,/^(?:inclusiveEndDates\b)/i,/^(?:topAxis\b)/i,/^(?:axisFormat\s[^#\n;]+)/i,/^(?:tickInterval\s[^#\n;]+)/i,/^(?:includes\s[^#\n;]+)/i,/^(?:excludes\s[^#\n;]+)/i,/^(?:todayMarker\s[^\n;]+)/i,/^(?:weekday\s+monday\b)/i,/^(?:weekday\s+tuesday\b)/i,/^(?:weekday\s+wednesday\b)/i,/^(?:weekday\s+thursday\b)/i,/^(?:weekday\s+friday\b)/i,/^(?:weekday\s+saturday\b)/i,/^(?:weekday\s+sunday\b)/i,/^(?:weekend\s+friday\b)/i,/^(?:weekend\s+saturday\b)/i,/^(?:\d\d\d\d-\d\d-\d\d\b)/i,/^(?:title\s[^\n]+)/i,/^(?:accDescription\s[^#\n;]+)/i,/^(?:section\s[^\n]+)/i,/^(?:[^:\n]+)/i,/^(?::[^#\n;]+)/i,/^(?::)/i,/^(?:$)/i,/^(?:.)/i],conditions:{acc_descr_multiline:{rules:[6,7],inclusive:!1},acc_descr:{rules:[4],inclusive:!1},acc_title:{rules:[2],inclusive:!1},callbackargs:{rules:[21,22],inclusive:!1},callbackname:{rules:[18,19,20],inclusive:!1},href:{rules:[15,16],inclusive:!1},click:{rules:[24,25],inclusive:!1},INITIAL:{rules:[0,1,3,5,8,9,10,11,12,13,14,17,23,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52],inclusive:!0}}};return y}();m.lexer=T;function p(){this.yy={}}return l(p,"Parser"),p.prototype=m,m.Parser=p,new p}();Mt.parser=Mt;var je=Mt;q.extend(Pe);q.extend(Re);q.extend(He);var Zt={friday:5,saturday:6},et="",$t="",Lt=void 0,At="",ht=[],mt=[],Ft=new Map,Ot=[],bt=[],kt="",Wt="",ie=["active","done","crit","milestone","vert"],Vt=[],ut="",gt=!1,Pt=!1,Nt="sunday",wt="saturday",Et=0,Ue=l(function(){Ot=[],bt=[],kt="",Vt=[],Tt=0,Yt=void 0,xt=void 0,U=[],et="",$t="",Wt="",Lt=void 0,At="",ht=[],mt=[],gt=!1,Pt=!1,Et=0,Ft=new Map,ut="",Oe(),Nt="sunday",wt="saturday"},"clear"),Xe=l(function(t){ut=t},"setDiagramId"),qe=l(function(t){$t=t},"setAxisFormat"),Ze=l(function(){return $t},"getAxisFormat"),Qe=l(function(t){Lt=t},"setTickInterval"),Ke=l(function(){return Lt},"getTickInterval"),Je=l(function(t){At=t},"setTodayMarker"),ts=l(function(){return At},"getTodayMarker"),es=l(function(t){et=t},"setDateFormat"),ss=l(function(){gt=!0},"enableInclusiveEndDates"),is=l(function(){return gt},"endDatesAreInclusive"),ns=l(function(){Pt=!0},"enableTopAxis"),rs=l(function(){return Pt},"topAxisEnabled"),as=l(function(t){Wt=t},"setDisplayMode"),os=l(function(){return Wt},"getDisplayMode"),cs=l(function(){return et},"getDateFormat"),ne=l((t,i)=>{const n=i.toLowerCase().split(/[\s,]+/).filter(e=>e!=="");return[...new Set([...t,...n])]},"mergeTokens"),ls=l(function(t){ht=ne(ht,t)},"setIncludes"),us=l(function(){return ht},"getIncludes"),ds=l(function(t){mt=ne(mt,t)},"setExcludes"),fs=l(function(){return mt},"getExcludes"),hs=l(function(){return Ft},"getLinks"),ms=l(function(t){kt=t,Ot.push(t)},"addSection"),ks=l(function(){return Ot},"getSections"),ys=l(function(){let t=Qt();const i=10;let n=0;for(;!t&&n<i;)t=Qt(),n++;return bt=U,bt},"getTasks"),re=l(function(t,i,n,e){const a=t.format(i.trim()),g=t.format("YYYY-MM-DD");return e.includes(a)||e.includes(g)?!1:n.includes("weekends")&&(t.isoWeekday()===Zt[wt]||t.isoWeekday()===Zt[wt]+1)||n.includes(t.format("dddd").toLowerCase())?!0:n.includes(a)||n.includes(g)},"isInvalidDate"),gs=l(function(t){Nt=t},"setWeekday"),vs=l(function(){return Nt},"getWeekday"),ps=l(function(t){wt=t},"setWeekend"),ae=l(function(t,i,n,e){if(!n.length||t.manualEndTime)return;let a;t.startTime instanceof Date?a=q(t.startTime):a=q(t.startTime,i,!0),a=a.add(1,"d");let g;t.endTime instanceof Date?g=q(t.endTime):g=q(t.endTime,i,!0);const[v,b]=Ts(a,g,i,n,e);t.endTime=v.toDate(),t.renderEndTime=b},"checkTaskDates"),Ts=l(function(t,i,n,e,a){let g=!1,v=null;const b=i.add(1e4,"d");for(;t<=i;){if(g||(v=i.toDate()),g=re(t,n,e,a),g&&(i=i.add(1,"d"),i>b))throw new Error("Failed to find a valid date that was not excluded by `excludes` after 10,000 iterations.");t=t.add(1,"d")}return[i,v]},"fixTaskDates"),oe=l(function(t,i){it.warn(`Gantt: the "${t}" statement references unknown task id(s): ${i.join(", ")}. Make sure the referenced tasks exist and declare an id. Milestones need both an id and a duration, e.g. "Milestone :milestone, m1, 2023-01-01, 0d".`)},"warnAboutUnknownTaskIds"),It=l(function(t,i,n){if(n=n.trim(),l(b=>{const L=b.trim();return L==="x"||L==="X"},"isTimestampFormat")(i)&&/^\d+$/.test(n))return new Date(Number(n));const g=/^after\s+(?<ids>[\d\w- ]+)/.exec(n);if(g!==null){let b=null;const L=[],F=g.groups.ids.split(" ").filter(O=>O!=="");for(const O of F){const $=ct(O);if($===void 0){L.push(O);continue}(!b||$.endTime>b.endTime)&&(b=$)}if(L.length>0&&oe("after",L),b)return b.endTime;const w=new Date;return w.setHours(0,0,0,0),w}let v=q(n,i.trim(),!0);if(v.isValid())return v.toDate();{it.debug("Invalid date:"+n),it.debug("With date format:"+i.trim());const b=new Date(n);if(b===void 0||isNaN(b.getTime())||b.getFullYear()<-1e4||b.getFullYear()>1e4)throw new Error("Invalid date:"+n);return b}},"getStartDate"),ce=l(function(t){const i=/^(\d+(?:\.\d+)?)([Mdhmswy]|ms)$/.exec(t.trim());return i!==null?[Number.parseFloat(i[1]),i[2]]:[NaN,"ms"]},"parseDuration"),le=l(function(t,i,n,e=!1){n=n.trim();const g=/^until\s+(?<ids>[\d\w- ]+)/.exec(n);if(g!==null){let w=null;const O=[],$=g.groups.ids.split(" ").filter(R=>R!=="");for(const R of $){const N=ct(R);if(N===void 0){O.push(R);continue}(!w||N.startTime<w.startTime)&&(w=N)}if(O.length>0&&oe("until",O),w)return w.startTime;const H=new Date;return H.setHours(0,0,0,0),H}let v=q(n,i.trim(),!0);if(v.isValid())return e&&(v=v.add(1,"d")),v.toDate();let b=q(t);const[L,F]=ce(n);if(Number.isNaN(L))it.warn(`Gantt: "${n}" is neither a valid date for the "${i.trim()}" date format nor a valid duration (e.g. "3d"), so it is ignored and the task gets a zero duration. Milestones need a duration too, e.g. "Milestone :milestone, m1, 2023-01-01, 0d".`);else{const w=b.add(L,F);w.isValid()&&(b=w)}return b.toDate()},"getEndDate"),Tt=0,ft=l(function(t){return t===void 0?(Tt=Tt+1,"task"+Tt):t},"parseId"),xs=l(function(t,i){let n;i.substr(0,1)===":"?n=i.substr(1,i.length):n=i;const e=n.split(","),a={};Rt(e,a,ie);for(let v=0;v<e.length;v++)e[v]=e[v].trim();let g="";switch(e.length){case 1:a.id=ft(),a.startTime=t.endTime,g=e[0];break;case 2:a.id=ft(),a.startTime=It(void 0,et,e[0]),g=e[1];break;case 3:a.id=ft(e[0]),a.startTime=It(void 0,et,e[1]),g=e[2];break}return g&&(a.endTime=le(a.startTime,et,g,gt),a.manualEndTime=q(g,"YYYY-MM-DD",!0).isValid(),ae(a,et,mt,ht)),a},"compileData"),bs=l(function(t,i){let n;i.substr(0,1)===":"?n=i.substr(1,i.length):n=i;const e=n.split(","),a={};Rt(e,a,ie);for(let g=0;g<e.length;g++)e[g]=e[g].trim();switch(e.length){case 1:a.id=ft(),a.startTime={type:"prevTaskEnd",id:t},a.endTime={data:e[0]};break;case 2:a.id=ft(),a.startTime={type:"getStartDate",startData:e[0]},a.endTime={data:e[1]};break;case 3:a.id=ft(e[0]),a.startTime={type:"getStartDate",startData:e[1]},a.endTime={data:e[2]};break}return a},"parseData"),Yt,xt,U=[],ue={},ws=l(function(t,i){const n={section:kt,type:kt,processed:!1,manualEndTime:!1,renderEndTime:null,raw:{data:i},task:t,classes:[]},e=bs(xt,i);n.raw.startTime=e.startTime,n.raw.endTime=e.endTime,n.id=e.id,n.prevTaskId=xt,n.active=e.active,n.done=e.done,n.crit=e.crit,n.milestone=e.milestone,n.vert=e.vert,n.vert?n.order=-1:(n.order=Et,Et++);const a=U.push(n);xt=n.id,ue[n.id]=a-1},"addTask"),ct=l(function(t){const i=ue[t];return U[i]},"findTaskById"),_s=l(function(t,i){const n={section:kt,type:kt,description:t,task:t,classes:[]},e=xs(Yt,i);n.startTime=e.startTime,n.endTime=e.endTime,n.id=e.id,n.active=e.active,n.done=e.done,n.crit=e.crit,n.milestone=e.milestone,n.vert=e.vert,Yt=n,bt.push(n)},"addTaskOrg"),Qt=l(function(){const t=l(function(n){const e=U[n];let a="";switch(U[n].raw.startTime.type){case"prevTaskEnd":{const g=ct(e.prevTaskId);e.startTime=g.endTime;break}case"getStartDate":a=It(void 0,et,U[n].raw.startTime.startData),a&&(U[n].startTime=a);break}return U[n].startTime&&(U[n].endTime=le(U[n].startTime,et,U[n].raw.endTime.data,gt),U[n].endTime&&(U[n].processed=!0,U[n].manualEndTime=q(U[n].raw.endTime.data,"YYYY-MM-DD",!0).isValid(),ae(U[n],et,mt,ht))),U[n].processed},"compileTask");let i=!0;for(const[n,e]of U.entries())t(n),i=i&&e.processed;return i},"compileTasks"),Ds=l(function(t,i){let n=i;dt().securityLevel!=="loose"&&(n=Fe(i)),t.split(",").forEach(function(e){ct(e)!==void 0&&(fe(e,()=>{window.open(n,"_self")}),Ft.set(e,n))}),de(t,"clickable")},"setLink"),de=l(function(t,i){t.split(",").forEach(function(n){let e=ct(n);e!==void 0&&e.classes.push(i)})},"setClass"),Ss=l(function(t,i,n){if(dt().securityLevel!=="loose"||i===void 0)return;let e=[];if(typeof n=="string"){e=n.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);for(let g=0;g<e.length;g++){let v=e[g].trim();v.startsWith('"')&&v.endsWith('"')&&(v=v.substr(1,v.length-2)),e[g]=v}}e.length===0&&e.push(t),ct(t)!==void 0&&fe(t,()=>{We.runFunc(i,...e)})},"setClickFun"),fe=l(function(t,i){Vt.push(function(){const n=ut?`${ut}-${t}`:t,e=document.querySelector(`[id="${n}"]`);e!==null&&e.addEventListener("click",function(){i()})},function(){const n=ut?`${ut}-${t}`:t,e=document.querySelector(`[id="${n}-text"]`);e!==null&&e.addEventListener("click",function(){i()})})},"pushFun"),Cs=l(function(t,i,n){t.split(",").forEach(function(e){Ss(e,i,n)}),de(t,"clickable")},"setClickEvent"),Ms=l(function(t){Vt.forEach(function(i){i(t)})},"bindFunctions"),Es={getConfig:l(()=>dt().gantt,"getConfig"),clear:Ue,setDateFormat:es,getDateFormat:cs,enableInclusiveEndDates:ss,endDatesAreInclusive:is,enableTopAxis:ns,topAxisEnabled:rs,setAxisFormat:qe,getAxisFormat:Ze,setTickInterval:Qe,getTickInterval:Ke,setTodayMarker:Je,getTodayMarker:ts,setAccTitle:ve,getAccTitle:ge,setDiagramTitle:ye,getDiagramTitle:ke,setDiagramId:Xe,setDisplayMode:as,getDisplayMode:os,setAccDescription:me,getAccDescription:he,addSection:ms,getSections:ks,getTasks:ys,addTask:ws,findTaskById:ct,addTaskOrg:_s,setIncludes:ls,getIncludes:us,setExcludes:ds,getExcludes:fs,setClickEvent:Cs,setLink:Ds,getLinks:hs,bindFunctions:Ms,parseDuration:ce,isInvalidDate:re,setWeekday:gs,getWeekday:vs,setWeekend:ps};function Rt(t,i,n){let e=!0;for(;e;)e=!1,n.forEach(function(a){const g="^\\s*"+a+"\\s*$",v=new RegExp(g);t[0].match(v)&&(i[a]=!0,t.shift(1),e=!0)})}l(Rt,"getTaskTags");q.extend(Ge);var Is=l(function(){it.debug("Something is calling, setConf, remove the call")},"setConf"),Kt={monday:$e,tuesday:Ye,wednesday:Ie,thursday:Ee,friday:Me,saturday:Ce,sunday:Se},Ys=l((t,i)=>{let n=[...t].map(()=>-1/0),e=[...t].sort((g,v)=>g.startTime-v.startTime||g.order-v.order),a=0;for(const g of e)for(let v=0;v<n.length;v++)if(g.startTime>=n[v]){n[v]=g.endTime,g.order=v+i,v>a&&(a=v);break}return a},"getMaxIntersections"),st,Ct=1e4,$s=l(function(t,i,n,e){const a=dt().gantt;e.db.setDiagramId(i);const g=dt().securityLevel;let v;g==="sandbox"&&(v=pt("#i"+i));const b=g==="sandbox"?pt(v.nodes()[0].contentDocument.body):pt("body"),L=g==="sandbox"?v.nodes()[0].contentDocument:document,F=L.getElementById(i);st=F.parentElement.offsetWidth,st===void 0&&(st=1200),a.useWidth!==void 0&&(st=a.useWidth);const w=e.db.getTasks(),O=w.filter(m=>!m.vert);let $=[];for(const m of O)$.push(m.type);$=I($);const H={};let R=2*a.topPadding;if(e.db.getDisplayMode()==="compact"||a.displayMode==="compact"){const m={};for(const p of O)m[p.section]===void 0?m[p.section]=[p]:m[p.section].push(p);let T=0;for(const p of Object.keys(m)){const y=Ys(m[p],T)+1;T+=y,R+=y*(a.barHeight+a.barGap),H[p]=y}}else{R+=O.length*(a.barHeight+a.barGap);for(const m of $)H[m]=O.filter(T=>T.type===m).length}F.setAttribute("viewBox","0 0 "+st+" "+R);const N=b.select(`[id="${i}"]`),k=pe().domain([Te(w,function(m){return m.startTime}),xe(w,function(m){return m.endTime})]).rangeRound([0,st-a.leftPadding-a.rightPadding]);function E(m,T){const p=m.startTime,y=T.startTime;let r=0;return p>y?r=1:p<y&&(r=-1),r}l(E,"taskCompare"),w.sort(E),W(w,st,R),be(N,R,st,a.useMaxWidth),N.append("text").text(e.db.getDiagramTitle()).attr("x",st/2).attr("y",a.titleTopMargin).attr("class","titleText");function W(m,T,p){const y=a.barHeight,r=y+a.barGap,d=a.topPadding,f=a.leftPadding,u=we().domain([0,$.length]).range(["#00B9FA","#F95002"]).interpolate(_e);X(r,d,f,T,p,m,e.db.getExcludes(),e.db.getIncludes()),Y(f,d,T,p),A(m,r,d,f,y,u,T),x(r,d),h(f,d,T,p)}l(W,"makeGantt");function A(m,T,p,y,r,d,f){m.sort((c,S)=>c.vert===S.vert?0:c.vert?1:-1);const u=m.filter(c=>!c.vert),s=[...new Set(u.map(c=>c.order))].map(c=>u.find(S=>S.order===c));N.append("g").selectAll("rect").data(s).enter().append("rect").attr("x",0).attr("y",function(c,S){return S=c.order,S*T+p-2}).attr("width",function(){return f-a.rightPadding/2}).attr("height",T).attr("class",function(c){for(const[S,C]of $.entries())if(c.type===C)return"section section"+S%a.numberSectionStyles;return"section section0"}).enter();const D=N.append("g").selectAll("rect").data(m).enter(),o=e.db.getLinks();if(D.append("rect").attr("id",function(c){return i+"-"+c.id}).attr("rx",3).attr("ry",3).attr("x",function(c){return c.milestone?k(c.startTime)+y+.5*(k(c.endTime)-k(c.startTime))-.5*r:k(c.startTime)+y}).attr("y",function(c,S){return S=c.order,c.vert?a.gridLineStartPadding:S*T+p}).attr("width",function(c){return c.milestone?r:c.vert?.08*r:k(c.renderEndTime||c.endTime)-k(c.startTime)}).attr("height",function(c){return c.vert?u.length*(a.barHeight+a.barGap)+a.barHeight*2:r}).attr("transform-origin",function(c,S){return S=c.order,(k(c.startTime)+y+.5*(k(c.endTime)-k(c.startTime))).toString()+"px "+(S*T+p+.5*r).toString()+"px"}).attr("class",function(c){const S="task";let C="";c.classes.length>0&&(C=c.classes.join(" "));let P=0;for(const[z,V]of $.entries())c.type===V&&(P=z%a.numberSectionStyles);let M="";return c.active?c.crit?M+=" activeCrit":M=" active":c.done?c.crit?M=" doneCrit":M=" done":c.crit&&(M+=" crit"),M.length===0&&(M=" task"),c.milestone&&(M=" milestone "+M),c.vert&&(M=" vert "+M),M+=P,M+=" "+C,S+M}),D.append("text").attr("id",function(c){return i+"-"+c.id+"-text"}).text(function(c){return c.task}).attr("font-size",a.fontSize).attr("x",function(c){let S=k(c.startTime),C=k(c.renderEndTime||c.endTime);if(c.milestone&&(S+=.5*(k(c.endTime)-k(c.startTime))-.5*r,C=S+r),c.vert)return k(c.startTime)+y;const P=this.getBBox().width;return P>C-S?C+P+1.5*a.leftPadding>f?S+y-5:C+y+5:(C-S)/2+S+y}).attr("y",function(c,S){return c.vert?a.gridLineStartPadding+u.length*(a.barHeight+a.barGap)+60:(S=c.order,S*T+a.barHeight/2+(a.fontSize/2-2)+p)}).attr("text-height",r).attr("class",function(c){const S=k(c.startTime);let C=k(c.endTime);c.milestone&&(C=S+r);const P=this.getBBox().width;let M="";c.classes.length>0&&(M=c.classes.join(" "));let z=0;for(const[nt,at]of $.entries())c.type===at&&(z=nt%a.numberSectionStyles);let V="";return c.active&&(c.crit?V="activeCritText"+z:V="activeText"+z),c.done?c.crit?V=V+" doneCritText"+z:V=V+" doneText"+z:c.crit&&(V=V+" critText"+z),c.milestone&&(V+=" milestoneText"),c.vert&&(V+=" vertText"),P>C-S?C+P+1.5*a.leftPadding>f?M+" taskTextOutsideLeft taskTextOutside"+z+" "+V:M+" taskTextOutsideRight taskTextOutside"+z+" "+V+" width-"+P:M+" taskText taskText"+z+" "+V+" width-"+P}),dt().securityLevel==="sandbox"){let c;c=pt("#i"+i);const S=c.nodes()[0].contentDocument;D.filter(function(C){return o.has(C.id)}).each(function(C){var P=S.querySelector("#"+CSS.escape(i+"-"+C.id)),M=S.querySelector("#"+CSS.escape(i+"-"+C.id+"-text"));const z=P.parentNode;var V=S.createElement("a");V.setAttribute("xlink:href",o.get(C.id)),V.setAttribute("target","_top"),z.appendChild(V),V.appendChild(P),V.appendChild(M)})}}l(A,"drawRects");function X(m,T,p,y,r,d,f,u){if(f.length===0&&u.length===0)return;let _,s;for(const{startTime:C,endTime:P}of d)(_===void 0||C<_)&&(_=C),(s===void 0||P>s)&&(s=P);if(!_||!s)return;if(q(s).diff(q(_),"year")>5){it.warn("The difference between the min and max time is more than 5 years. This will cause performance issues. Skipping drawing exclude days.");return}const D=e.db.getDateFormat(),o=[];let B=null,c=q(_);for(;c.valueOf()<=s;)e.db.isInvalidDate(c,D,f,u)?B?B.end=c:B={start:c,end:c}:B&&(o.push(B),B=null),c=c.add(1,"d");N.append("g").selectAll("rect").data(o).enter().append("rect").attr("id",C=>i+"-exclude-"+C.start.format("YYYY-MM-DD")).attr("x",C=>k(C.start.startOf("day"))+p).attr("y",a.gridLineStartPadding).attr("width",C=>k(C.end.endOf("day"))-k(C.start.startOf("day"))).attr("height",r-T-a.gridLineStartPadding).attr("transform-origin",function(C,P){return(k(C.start)+p+.5*(k(C.end)-k(C.start))).toString()+"px "+(P*m+.5*r).toString()+"px"}).attr("class","exclude-range")}l(X,"drawExcludeDays");function G(m,T,p,y){if(p<=0||m>T)return 1/0;const r=T-m,d=q.duration({[y??"day"]:p}).asMilliseconds();return d<=0?1/0:Math.ceil(r/d)}l(G,"getEstimatedTickCount");function Y(m,T,p,y){const r=e.db.getDateFormat(),d=e.db.getAxisFormat();let f;d?f=d:r==="D"?f="%d":f=a.axisFormat??"%Y-%m-%d";let u=De(k).tickSize(-y+T+a.gridLineStartPadding).tickFormat(Ht(f));const s=/^([1-9]\d*)(millisecond|second|minute|hour|day|week|month)$/.exec(e.db.getTickInterval()||a.tickInterval);if(s!==null){const D=parseInt(s[1],10);if(isNaN(D)||D<=0)it.warn(`Invalid tick interval value: "${s[1]}". Skipping custom tick interval.`);else{const o=s[2],B=e.db.getWeekday()||a.weekday,c=k.domain(),S=c[0],C=c[1],P=G(S,C,D,o);if(P>Ct)it.warn(`The tick interval "${D}${o}" would generate ${P} ticks, which exceeds the maximum allowed (${Ct}). This may indicate an invalid date or time range. Skipping custom tick interval.`);else switch(o){case"millisecond":u.ticks(qt.every(D));break;case"second":u.ticks(Xt.every(D));break;case"minute":u.ticks(Ut.every(D));break;case"hour":u.ticks(jt.every(D));break;case"day":u.ticks(Gt.every(D));break;case"week":u.ticks(Kt[B].every(D));break;case"month":u.ticks(Bt.every(D));break}}}if(N.append("g").attr("class","grid").attr("transform","translate("+m+", "+(y-50)+")").call(u).selectAll("text").style("text-anchor","middle").attr("fill","#000").attr("stroke","none").attr("font-size",10).attr("dy","1em"),e.db.topAxisEnabled()||a.topAxis){let D=Le(k).tickSize(-y+T+a.gridLineStartPadding).tickFormat(Ht(f));if(s!==null){const o=parseInt(s[1],10);if(isNaN(o)||o<=0)it.warn(`Invalid tick interval value: "${s[1]}". Skipping custom tick interval.`);else{const B=s[2],c=e.db.getWeekday()||a.weekday,S=k.domain(),C=S[0],P=S[1];if(G(C,P,o,B)<=Ct)switch(B){case"millisecond":D.ticks(qt.every(o));break;case"second":D.ticks(Xt.every(o));break;case"minute":D.ticks(Ut.every(o));break;case"hour":D.ticks(jt.every(o));break;case"day":D.ticks(Gt.every(o));break;case"week":D.ticks(Kt[c].every(o));break;case"month":D.ticks(Bt.every(o));break}}}N.append("g").attr("class","grid").attr("transform","translate("+m+", "+T+")").call(D).selectAll("text").style("text-anchor","middle").attr("fill","#000").attr("stroke","none").attr("font-size",10)}}l(Y,"makeGrid");function x(m,T){let p=0;const y=Object.keys(H).map(r=>[r,H[r]]);N.append("g").selectAll("text").data(y).enter().append(function(r){const d=r[0].split(Ae.lineBreakRegex),f=-(d.length-1)/2,u=L.createElementNS("http://www.w3.org/2000/svg","text");u.setAttribute("dy",f+"em");for(const[_,s]of d.entries()){const D=L.createElementNS("http://www.w3.org/2000/svg","tspan");D.setAttribute("alignment-baseline","central"),D.setAttribute("x","10"),_>0&&D.setAttribute("dy","1em"),D.textContent=s,u.appendChild(D)}return u}).attr("x",10).attr("y",function(r,d){if(d>0)for(let f=0;f<d;f++)return p+=y[d-1][1],r[1]*m/2+p*m+T;else return r[1]*m/2+T}).attr("font-size",a.sectionFontSize).attr("class",function(r){for(const[d,f]of $.entries())if(r[0]===f)return"sectionTitle sectionTitle"+d%a.numberSectionStyles;return"sectionTitle"})}l(x,"vertLabels");function h(m,T,p,y){const r=e.db.getTodayMarker();if(r==="off")return;const d=N.append("g").attr("class","today"),f=new Date,u=d.append("line");u.attr("x1",k(f)+m).attr("x2",k(f)+m).attr("y1",a.titleTopMargin).attr("y2",y-a.titleTopMargin).attr("class","today"),r!==""&&u.attr("style",r.replace(/,/g,";"))}l(h,"drawToday");function I(m){const T={},p=[];for(let y=0,r=m.length;y<r;++y)Object.prototype.hasOwnProperty.call(T,m[y])||(T[m[y]]=!0,p.push(m[y]));return p}l(I,"checkUnique")},"draw"),Ls={setConf:Is,draw:$s},As=l(t=>`
  .mermaid-main-font {
        font-family: ${t.fontFamily};
  }

  .exclude-range {
    fill: ${t.excludeBkgColor};
  }

  .section {
    stroke: none;
    opacity: 0.2;
  }

  .section0 {
    fill: ${t.sectionBkgColor};
  }

  .section2 {
    fill: ${t.sectionBkgColor2};
  }

  .section1,
  .section3 {
    fill: ${t.altSectionBkgColor};
    opacity: 0.2;
  }

  .sectionTitle0 {
    fill: ${t.titleColor};
  }

  .sectionTitle1 {
    fill: ${t.titleColor};
  }

  .sectionTitle2 {
    fill: ${t.titleColor};
  }

  .sectionTitle3 {
    fill: ${t.titleColor};
  }

  .sectionTitle {
    text-anchor: start;
    font-family: ${t.fontFamily};
  }


  /* Grid and axis */

  .grid .tick {
    stroke: ${t.gridColor};
    opacity: 0.8;
    shape-rendering: crispEdges;
  }

  .grid .tick text {
    font-family: ${t.fontFamily};
    fill: ${t.textColor};
  }

  .grid path {
    stroke-width: 0;
  }


  /* Today line */

  .today {
    fill: none;
    stroke: ${t.todayLineColor};
    stroke-width: 2px;
  }


  /* Task styling */

  /* Default task */

  .task {
    stroke-width: 2;
  }

  .taskText {
    text-anchor: middle;
    font-family: ${t.fontFamily};
  }

  .taskTextOutsideRight {
    fill: ${t.taskTextDarkColor};
    text-anchor: start;
    font-family: ${t.fontFamily};
  }

  .taskTextOutsideLeft {
    fill: ${t.taskTextDarkColor};
    text-anchor: end;
  }


  /* Special case clickable */

  .task.clickable {
    cursor: pointer;
  }

  .taskText.clickable {
    cursor: pointer;
    fill: ${t.taskTextClickableColor} !important;
    font-weight: bold;
  }

  .taskTextOutsideLeft.clickable {
    cursor: pointer;
    fill: ${t.taskTextClickableColor} !important;
    font-weight: bold;
  }

  .taskTextOutsideRight.clickable {
    cursor: pointer;
    fill: ${t.taskTextClickableColor} !important;
    font-weight: bold;
  }


  /* Specific task settings for the sections*/

  .taskText0,
  .taskText1,
  .taskText2,
  .taskText3 {
    fill: ${t.taskTextColor};
  }

  .task0,
  .task1,
  .task2,
  .task3 {
    fill: ${t.taskBkgColor};
    stroke: ${t.taskBorderColor};
  }

  .taskTextOutside0,
  .taskTextOutside2
  {
    fill: ${t.taskTextOutsideColor};
  }

  .taskTextOutside1,
  .taskTextOutside3 {
    fill: ${t.taskTextOutsideColor};
  }


  /* Active task */

  .active0,
  .active1,
  .active2,
  .active3 {
    fill: ${t.activeTaskBkgColor};
    stroke: ${t.activeTaskBorderColor};
  }

  .activeText0,
  .activeText1,
  .activeText2,
  .activeText3 {
    fill: ${t.taskTextDarkColor} !important;
  }


  /* Completed task */

  .done0,
  .done1,
  .done2,
  .done3 {
    stroke: ${t.doneTaskBorderColor};
    fill: ${t.doneTaskBkgColor};
    stroke-width: 2;
  }

  .doneText0,
  .doneText1,
  .doneText2,
  .doneText3 {
    fill: ${t.taskTextDarkColor} !important;
  }

  /* Done task text displayed outside the bar sits against the diagram background,
     not against the done-task bar, so it must use the outside/contrast color. */
  .doneText0.taskTextOutsideLeft,
  .doneText0.taskTextOutsideRight,
  .doneText1.taskTextOutsideLeft,
  .doneText1.taskTextOutsideRight,
  .doneText2.taskTextOutsideLeft,
  .doneText2.taskTextOutsideRight,
  .doneText3.taskTextOutsideLeft,
  .doneText3.taskTextOutsideRight {
    fill: ${t.taskTextOutsideColor} !important;
  }


  /* Tasks on the critical line */

  .crit0,
  .crit1,
  .crit2,
  .crit3 {
    stroke: ${t.critBorderColor};
    fill: ${t.critBkgColor};
    stroke-width: 2;
  }

  .activeCrit0,
  .activeCrit1,
  .activeCrit2,
  .activeCrit3 {
    stroke: ${t.critBorderColor};
    fill: ${t.activeTaskBkgColor};
    stroke-width: 2;
  }

  .doneCrit0,
  .doneCrit1,
  .doneCrit2,
  .doneCrit3 {
    stroke: ${t.critBorderColor};
    fill: ${t.doneTaskBkgColor};
    stroke-width: 2;
    cursor: pointer;
    shape-rendering: crispEdges;
  }

  .milestone {
    transform: rotate(45deg) scale(0.8,0.8);
  }

  .milestoneText {
    font-style: italic;
  }
  .doneCritText0,
  .doneCritText1,
  .doneCritText2,
  .doneCritText3 {
    fill: ${t.taskTextDarkColor} !important;
  }

  /* Done-crit task text outside the bar — same reasoning as doneText above. */
  .doneCritText0.taskTextOutsideLeft,
  .doneCritText0.taskTextOutsideRight,
  .doneCritText1.taskTextOutsideLeft,
  .doneCritText1.taskTextOutsideRight,
  .doneCritText2.taskTextOutsideLeft,
  .doneCritText2.taskTextOutsideRight,
  .doneCritText3.taskTextOutsideLeft,
  .doneCritText3.taskTextOutsideRight {
    fill: ${t.taskTextOutsideColor} !important;
  }

  .vert {
    stroke: ${t.vertLineColor};
  }

  .vertText {
    font-size: 15px;
    text-anchor: middle;
    fill: ${t.vertLineColor} !important;
  }

  .activeCritText0,
  .activeCritText1,
  .activeCritText2,
  .activeCritText3 {
    fill: ${t.taskTextDarkColor} !important;
  }

  .titleText {
    text-anchor: middle;
    font-size: 18px;
    fill: ${t.titleColor||t.textColor};
    font-family: ${t.fontFamily};
  }
`,"getStyles"),Fs=As,Vs={parser:je,db:Es,renderer:Ls,styles:Fs};export{Vs as diagram};
