/* -*- Mode: C; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * The contents of this file are subject to the Netscape Public License
 * Version 1.0 (the "NPL"); you may not use this file except in
 * compliance with the NPL.  You may obtain a copy of the NPL at
 * http://www.mozilla.org/NPL/
 *
 * Software distributed under the NPL is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the NPL
 * for the specific language governing rights and limitations under the
 * NPL.
 *
 * The Initial Developer of this code under the NPL is Netscape
 * Communications Corporation.  Portions created by Netscape are
 * Copyright (C) 1998 Netscape Communications Corporation.  All Rights
 * Reserved.
 */

/* 
   This file synthesizes default columns for a given node.
   For more information on this file, contact rjc or guha 
   For more information on RDF, look at the RDF section of www.mozilla.org
*/

#include "columns.h"



RDF_Cursor
ColumnsGetSlotValues (RDFT rdf, RDF_Resource u, RDF_Resource s,
		RDF_ValueType type,  PRBool inversep, PRBool tv)
{
	RDF_Cursor		c;

	if (!containerp(u) || (s != gNavCenter->RDF_Column) || (inversep) ||
		(!tv) || (type != RDF_RESOURCE_TYPE)) 
	{
		return(NULL);
	}
	if ((c = (RDF_Cursor)getMem(sizeof(struct RDF_CursorStruct))) != NULL)
	{
		c->u = u;
		c->value = NULL;
		c->count = 0;
	}
	return(c);
}



void *
ColumnsGetSlotValue(RDFT rdf, RDF_Resource u, RDF_Resource s, RDF_ValueType type,
		PRBool inversep, PRBool tv)
{
	void			*val = NULL;

	if (u == NULL)	return(NULL);

	if ((s == gCoreVocab->RDF_name) && (type == RDF_STRING_TYPE)
		&& (!inversep) && (tv))
	{
		/* XXX localization */
		if (u == gCoreVocab->RDF_name)			val = copyString("Name");
		else if (u == gWebData->RDF_URL)		val = copyString("URL");
		else if (u == gWebData->RDF_description)	val = copyString("Description");
		else if (u == gWebData->RDF_firstVisitDate)	val = copyString("First Visit");
		else if (u == gWebData->RDF_lastVisitDate)	val = copyString("Last Visit");
		else if (u == gWebData->RDF_numAccesses)	val = copyString("Accesses");
		else if (u == gWebData->RDF_creationDate)	val = copyString("Created");
		else if (u == gWebData->RDF_lastModifiedDate)	val = copyString("Modified");
		else if (u == gWebData->RDF_size)		val = copyString("Size");
		else if (u == gNavCenter->RDF_bookmarkAddDate)	val = copyString("Added");
		else val = copyString(resourceID(u));
	}
	else if ((s == gNavCenter->RDF_ColumnDataType) &&
		(type == RDF_INT_TYPE) && (!inversep) && (tv))
	{
		if (u == gNavCenter->RDF_bookmarkAddDate ||
		    u == gWebData->RDF_lastVisitDate ||
		    u == gWebData->RDF_lastModifiedDate)
		{
			val = (void *)HT_COLUMN_DATE_STRING;
		}
		else if (u == gWebData->RDF_firstVisitDate)
		{
			val = (void *)HT_COLUMN_DATE_INT;
		}
		else if (u == gWebData->RDF_size ||
			 u == gWebData->RDF_numAccesses)
		{
			val = (void *)HT_COLUMN_INT;
		}
		else
		{
			/* default to string... XXX wrong thing to do */
			val = (void *)HT_COLUMN_STRING;
		}
	}
	else if ((s == gNavCenter->RDF_ColumnWidth) &&
		(type == RDF_INT_TYPE) && (!inversep) && (tv))
	{
		if (u == gCoreVocab->RDF_name)		val = (void *)128L;
		else if (u == gWebData->RDF_URL)	val = (void *)200L;
		else					val = (void *)80;
	}
	return(val);
}



void *
ColumnsNextValue (RDFT rdf, RDF_Cursor c)
{
	void			*arc = NULL;

	XP_ASSERT(c != NULL);
	if (c == NULL)		return(NULL);

	switch( resourceType(c->u) )
	{
		case	RDF_RT:
		if ((c->u == gNavCenter->RDF_Sitemaps) || (c->u == gNavCenter->RDF_Mail))
		{
			switch(c->count)
			{
				case	0:	arc = gCoreVocab->RDF_name;		break;
				case	1:	arc = gWebData->RDF_URL;		break;
			}
		}
		else
		{
			switch(c->count)
			{
				case	0:	arc = gCoreVocab->RDF_name;		break;
				case	1:	arc = gWebData->RDF_URL;		break;
				case	2:	arc = gWebData->RDF_description;	break;
				case	3:	arc = gNavCenter->RDF_bookmarkAddDate;	break;
				case	4:	arc = gWebData->RDF_lastVisitDate;	break;
				case	5:	arc = gWebData->RDF_lastModifiedDate;	break;
			}
		}
		break;

		case	HISTORY_RT:
		switch(c->count)
		{
			case	0:	arc = gCoreVocab->RDF_name;		break;
			case	1:	arc = gWebData->RDF_URL;		break;
			case	2:	arc = gWebData->RDF_firstVisitDate;	break;
			case	3:	arc = gWebData->RDF_lastVisitDate;	break;
			case	4:	arc = NULL;				break;
			case	5:	arc = gWebData->RDF_numAccesses;	break;
		}
		break;

		case	FTP_RT:
		case	ES_RT:
		switch(c->count)
		{
			case	0:	arc = gCoreVocab->RDF_name;		break;
			case	1:	arc = gWebData->RDF_URL;		break;
		}
		break;

		case	LFS_RT:
		switch(c->count)
		{
			case	0:	arc = gCoreVocab->RDF_name;		break;
			case	1:	arc = gWebData->RDF_URL;		break;
			case	2:	arc = gWebData->RDF_size;		break;
#ifdef	NSPR20
			case	3:	arc = gWebData->RDF_creationDate;	break;
#endif
			case	4:	arc = gWebData->RDF_lastModifiedDate;	break;
		}
		break;

		case	LDAP_RT:
		switch(c->count)
		{
			case	0:	arc = gCoreVocab->RDF_name;		break;
		}
		break;

		case	PM_RT:
		case	IM_RT:
		switch(c->count)
		{
			case	0:	arc = gCoreVocab->RDF_name;		break;
			case	1:	arc = gWebData->RDF_URL;		break;
		}
		break;

		default:
		switch(c->count)
		{
			case	0:	arc = gCoreVocab->RDF_name;		break;
		}
		break;
	}
	++(c->count);
	return(arc);
}



RDF_Error
ColumnsDisposeCursor (RDFT rdf, RDF_Cursor c)
{
	if (c != NULL)
	{
		freeMem(c);
	} 
	return(0);
}



RDFT
MakeColumnStore (char* url)
{
	RDFT		ntr = NULL;

	if (strstr(url, "rdf:columns"))
	{
		if ((ntr = (RDFT)getMem(sizeof(struct RDF_TranslatorStruct))) != NULL)
		{
			ntr->getSlotValues = ColumnsGetSlotValues;
			ntr->getSlotValue = ColumnsGetSlotValue;
			ntr->nextValue = ColumnsNextValue;
			ntr->disposeCursor = ColumnsDisposeCursor;
			ntr->url = copyString(url);
		}
	       
	}
	
	return(ntr);
}
