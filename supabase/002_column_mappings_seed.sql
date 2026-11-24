-- Heading -> school source mappings. Exact EMIS match; private_schools excluded.
create unique index if not exists column_mappings_alias_source_uq
  on public.column_mappings (normalized_heading, source_table, source_field);

with fields(canon, public_schools, pef_schools, piema_schools, schools) as (values
 ('emis','emis','emis_code','emis_code','emis'),
 ('school_name','school_name','school_name','school_name','school_name'),
 ('district','district','district','district','district'),
 ('tehsil','tehsil','tehsil','tehsil','tehsil'),
 ('markaz','markaz_name','markaz_name','markaz_name','markaz'),
 ('level','level','level','level','level'),
 ('wing','wing','wing','wing','wing'),
 ('type','type','type','type','type'),
 ('area','area','area','area','area'),
 ('enrollment','total_enrollment','total_enrollment',null,null),
 ('rooms','total_rooms','total_rooms','total_rooms',null),
 ('teaching_rooms','used_for_teaching','used_for_teaching','used_for_teaching',null),
 ('washrooms','total_washrooms','total_washrooms','total_washrooms',null),
 ('furniture','total_furniture','total_furniture','total_furniture',null),
 ('boundary_wall','boundary_wall_status','boundary_wall_status','boundary_wall_status',null),
 ('electricity','electricity_source','electricity_source','electricity_source',null),
 ('address','physical_address','physical_address','physical_address',null),
 ('latitude','latitude','latitude','latitude',null),
 ('longitude','longitude','longitude','longitude',null),
 ('smp_enrollment','smp_ece_to_5_enrollment','smp_ece_to_5_enrollment',null,null)
), aliases(canon, heading) as (values
 ('emis','EMIS'),('emis','EMIS Code'),('emis','School EMIS'),('emis','EMIS No'),('emis','EMIS Number'),
 ('school_name','School'),('school_name','School Name'),('school_name','Name of School'),('school_name','Institution'),
 ('district','District'),('tehsil','Tehsil'),
 ('markaz','Markaz'),('markaz','Markaz Name'),
 ('level','Level'),('level','School Level'),('wing','Wing'),
 ('type','Type'),('type','School Type'),('area','Area'),
 ('enrollment','Enrollment'),('enrollment','Enrolment'),('enrollment','Total Enrollment'),('enrollment','Total Enrolment'),
 ('rooms','Rooms'),('rooms','Total Rooms'),
 ('teaching_rooms','Rooms Used for Teaching'),('teaching_rooms','Used for Teaching'),
 ('washrooms','Washrooms'),('washrooms','Total Washrooms'),
 ('furniture','Furniture'),('furniture','Total Furniture'),
 ('boundary_wall','Boundary Wall'),('boundary_wall','Boundary Wall Status'),
 ('electricity','Electricity'),('electricity','Electricity Source'),
 ('address','Address'),('address','Physical Address'),
 ('latitude','Latitude'),('longitude','Longitude'),
 ('smp_enrollment','SMP Enrollment')
), src(tbl, prio, keycol) as (values
 ('public_schools',1,'emis'),('pef_schools',2,'emis_code'),('piema_schools',3,'emis_code'),('schools',4,'emis')
), expanded as (
 select a.heading, a.canon, s.tbl, s.prio, s.keycol,
  case s.tbl when 'public_schools' then f.public_schools when 'pef_schools' then f.pef_schools
             when 'piema_schools' then f.piema_schools else f.schools end as col
 from aliases a join fields f using (canon) cross join src s
)
insert into public.column_mappings (target_heading, normalized_heading, source_table, source_field, match_rule, enabled)
select heading, trim(regexp_replace(lower(heading), '[^a-z0-9]+', ' ', 'g')), tbl, col,
       case when canon='emis' then 'key' else 'emis_exact:'||keycol end || ';priority=' || prio, true
from expanded where col is not null
on conflict do nothing;
